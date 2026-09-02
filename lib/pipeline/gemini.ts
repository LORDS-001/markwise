/**
 * Gemini REST client — PRD §9.
 *
 * Deliberately plain `fetch` rather than an SDK: the surface used here is
 * three endpoints, and a zero-dependency client keeps the pipeline auditable
 * and immune to SDK churn during the build window.
 *
 * The key is read from GEMINI_API_KEY — server-side only, never NEXT_PUBLIC,
 * so it cannot reach the browser bundle.
 */

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta";

export const TEXT_MODEL = "gemini-2.5-flash";
export const EMBEDDING_MODEL = "text-embedding-004";

/** Matches the vector(768) column in migration 0001. */
export const EMBEDDING_DIMENSIONS = 768;

const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 600;
const REQUEST_TIMEOUT_MS = 60_000;

export function geminiApiKey(): string | null {
  // Hard stop rather than a silent null: reaching here in a browser means an
  // import chain has dragged the pipeline into the client bundle, and the
  // failure should be loud during development, not a mystery at runtime.
  if (typeof window !== "undefined") {
    throw new Error(
      "The Markwise pipeline must not run in the browser. Call it from a route handler or server action.",
    );
  }
  const key = process.env.GEMINI_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

export function isPipelineConfigured(): boolean {
  return geminiApiKey() !== null;
}

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

function retryable(status: number): boolean {
  // 429 rate limit, 500/503 transient. 4xx otherwise means the request is
  // wrong and retrying it just spends quota to fail again.
  return status === 429 || status >= 500;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const key = geminiApiKey();
  if (!key) {
    throw new GeminiError(
      "GEMINI_API_KEY is not set. Add it to .env.local to run the pipeline.",
    );
  }

  let lastError: GeminiError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_ROOT}/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.ok) return (await response.json()) as T;

      const text = await response.text().catch(() => "");
      lastError = new GeminiError(
        `Gemini ${response.status}: ${text.slice(0, 400)}`,
        response.status,
      );
      if (!retryable(response.status) || attempt === MAX_ATTEMPTS) throw lastError;
    } catch (error) {
      if (error instanceof GeminiError) {
        if (!retryable(error.status ?? 0) || attempt === MAX_ATTEMPTS) throw error;
        lastError = error;
      } else {
        lastError = new GeminiError(
          error instanceof Error ? error.message : "Gemini request failed",
        );
        if (attempt === MAX_ATTEMPTS) throw lastError;
      }
    } finally {
      clearTimeout(timer);
    }

    // Exponential backoff with jitter, so 40 concurrent answers hitting a rate
    // limit do not all retry on the same tick and trip it again.
    const delay = BASE_BACKOFF_MS * 2 ** (attempt - 1) * (0.5 + Math.random());
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw lastError ?? new GeminiError("Gemini request failed");
}

interface GenerateResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
}

/**
 * One JSON generation, constrained by a response schema so the model cannot
 * return prose where an object is expected.
 */
export async function generateJson<T>(options: {
  prompt: string;
  schema: Record<string, unknown>;
  system?: string;
  temperature?: number;
}): Promise<T> {
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: options.prompt }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.2,
      responseMimeType: "application/json",
      responseSchema: options.schema,
    },
  };
  if (options.system) {
    body.systemInstruction = { parts: [{ text: options.system }] };
  }

  const data = await post<GenerateResponse>(
    `models/${TEXT_MODEL}:generateContent`,
    body,
  );

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

  if (text.trim().length === 0) {
    throw new GeminiError(
      `Gemini returned no content (finishReason: ${candidate?.finishReason ?? "unknown"})`,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new GeminiError(`Gemini returned unparseable JSON: ${text.slice(0, 300)}`);
  }
}

interface BatchEmbedResponse {
  embeddings?: { values?: number[] }[];
}

/**
 * Embeds error signatures — never raw answers (PRD §6 step 2). Raw answers
 * cluster on writing style, length, and shared question wording; signatures
 * cluster on meaning.
 *
 * Batched, because one request per answer would be 40 round trips.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const BATCH_SIZE = 100;
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE);
    const data = await post<BatchEmbedResponse>(
      `models/${EMBEDDING_MODEL}:batchEmbedContents`,
      {
        requests: slice.map((text) => ({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
          taskType: "SEMANTIC_SIMILARITY",
        })),
      },
    );

    const embeddings = data.embeddings ?? [];
    if (embeddings.length !== slice.length) {
      throw new GeminiError(
        `Embedding count mismatch: asked for ${slice.length}, got ${embeddings.length}`,
      );
    }
    for (const embedding of embeddings) {
      const values = embedding.values ?? [];
      if (values.length === 0) throw new GeminiError("Embedding came back empty");
      out.push(values);
    }
  }

  return out;
}

/**
 * Runs `worker` over `items` with bounded concurrency, preserving input order.
 *
 * Forty answers fired at once trips the rate limit; forty fired in sequence
 * blows the two-minute budget in PRD §12. Six at a time holds both.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

export const CONCURRENCY = 6;
