/**
 * Gemini embedding client — PRD §6 step 2.
 *
 * Embeddings only. The four generative stages run on Claude (claude.ts);
 * Gemini stays because Anthropic publishes no embedding model and clustering
 * needs vectors, so the split is forced rather than chosen.
 *
 * Deliberately plain `fetch` rather than an SDK: the surface used here is one
 * endpoint, and a zero-dependency client keeps it auditable.
 *
 * The key is read from GEMINI_API_KEY — server-side only, never NEXT_PUBLIC,
 * so it cannot reach the browser bundle.
 */

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta";

export const EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL?.trim() || "gemini-embedding-001";

/**
 * Matches the vector(768) column in migration 0001.
 *
 * gemini-embedding-001 returns 3072 by default; asking for 768 keeps the
 * schema as it is. Vectors at reduced dimensionality come back un-normalised,
 * which does not matter here because cosineDistance divides by both norms.
 */
export const EMBEDDING_DIMENSIONS = 768;

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 600;
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Requests allowed per rolling minute.
 *
 * The free tier allows roughly 20/min, and a 40-answer batch is 40 extraction
 * calls plus a few per cluster — so without a limiter the run burns its quota
 * in the first ten seconds and the remaining thirty answers come back
 * undiagnosed. That failure is quiet and disastrous: the lecturer gets a map
 * built from three answers and no indication the rest were never read.
 *
 * Raise it with GEMINI_RPM on a paid tier, where the whole run fits inside the
 * two-minute budget in PRD §12.
 */
function requestsPerMinute(): number {
  const configured = Number(process.env.GEMINI_RPM);
  return Number.isFinite(configured) && configured > 0 ? configured : 15;
}

/** Start times of in-flight and recent requests, oldest first. */
const recentRequests: number[] = [];

/** Blocks until starting another request keeps us inside the rolling window. */
async function waitForSlot(): Promise<void> {
  for (;;) {
    const now = Date.now();
    const limit = requestsPerMinute();

    while (recentRequests.length > 0 && now - recentRequests[0] >= 60_000) {
      recentRequests.shift();
    }

    if (recentRequests.length < limit) {
      recentRequests.push(now);
      return;
    }

    // Wait until the oldest request leaves the window, plus a little slack so
    // a clock difference with the server does not put us back over.
    const waitMs = 60_000 - (now - recentRequests[0]) + 50;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

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

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

/**
 * Reads the retryDelay the API returns alongside a quota error, e.g.
 * `"retryDelay": "37s"`. Capped so a pathological value cannot hang a run.
 */
function retryDelayFrom(body: string): number | null {
  const match = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body);
  if (!match) return null;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.min(seconds * 1000 + 250, 65_000);
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
  let serverRetryMs: number | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await waitForSlot();

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
      serverRetryMs = retryDelayFrom(text);
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

    // Prefer the server's own retryDelay: on a quota error it knows when the
    // window reopens, and guessing shorter just spends another attempt to be
    // refused again. Otherwise exponential backoff with jitter, so 40 answers
    // hitting the limit together do not all retry on the same tick.
    const delay =
      serverRetryMs ??
      BASE_BACKOFF_MS * 2 ** (attempt - 1) * (0.5 + Math.random());
    serverRetryMs = null;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw lastError ?? new GeminiError("Gemini request failed");
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
          outputDimensionality: EMBEDDING_DIMENSIONS,
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
