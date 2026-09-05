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

/**
 * Flash keeps per-answer extraction latency low. Web admission accounts for
 * the configured request rate and the route's bounded runtime.
 *
 * Overridable because the free tier's daily request quota is charged **per
 * model**, so which model you can actually finish a batch on depends on the
 * account, and that should not need a code change to fix.
 */
export const TEXT_MODEL =
  process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
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
 * Raise it only when the provider account supports the higher rate. Route
 * admission rejects batches this limiter cannot start within its time budget.
 */
export function geminiRequestsPerMinute(): number {
  const configured = Number(process.env.GEMINI_RPM);
  return Number.isFinite(configured) && configured >= 1
    ? Math.floor(configured)
    : 15;
}

const RATE_WINDOW_MS = 60_050;
const COMPLETION_RESERVE_MS = 25_000;

/** Request starts the limiter can admit while leaving time for final work. */
export function geminiRequestCapacity(runBudgetMs: number): number {
  const usableMs = runBudgetMs - COMPLETION_RESERVE_MS;
  if (!Number.isFinite(usableMs) || usableMs < 0) return 0;
  const windows = Math.floor(usableMs / RATE_WINDOW_MS) + 1;
  return windows * geminiRequestsPerMinute();
}

/** Blocks until starting another request keeps us inside the rolling window. */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new GeminiError("AI request was cancelled.");
  }
}

async function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(
        signal?.reason instanceof Error
          ? signal.reason
          : new GeminiError("AI request was cancelled."),
      );
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export function createRequestLimiter(options: {
  requestsPerMinute: () => number;
  now: () => number;
  sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}): (signal?: AbortSignal) => Promise<void> {
  const recentRequests: number[] = [];
  return async (signal?: AbortSignal) => {
    for (;;) {
      throwIfAborted(signal);
      const now = options.now();
      const limit = options.requestsPerMinute();

      while (recentRequests.length > 0 && now - recentRequests[0] >= 60_000) {
        recentRequests.shift();
      }

      if (recentRequests.length < limit) {
        recentRequests.push(now);
        return;
      }

      const waitMs = 60_000 - (now - recentRequests[0]) + 50;
      await options.sleep(waitMs, signal);
    }
  };
}

const waitForSlot = createRequestLimiter({
  requestsPerMinute: geminiRequestsPerMinute,
  now: Date.now,
  sleep: abortableDelay,
});

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

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const key = geminiApiKey();
  if (!key) {
    throw new GeminiError(
      "GEMINI_API_KEY is not set. Add it to .env.local to run the pipeline.",
    );
  }

  let lastError: GeminiError | null = null;
  let serverRetryMs: number | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    throwIfAborted(signal);
    await waitForSlot(signal);

    const controller = new AbortController();
    const cancel = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", cancel, { once: true });
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
        `Gemini request failed (status ${response.status}).`,
        response.status,
      );
      if (!retryable(response.status) || attempt === MAX_ATTEMPTS) throw lastError;
    } catch (error) {
      if (signal?.aborted) throwIfAborted(signal);
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
      signal?.removeEventListener("abort", cancel);
    }

    // Prefer the server's own retryDelay: on a quota error it knows when the
    // window reopens, and guessing shorter just spends another attempt to be
    // refused again. Otherwise exponential backoff with jitter, so 40 answers
    // hitting the limit together do not all retry on the same tick.
    const delay =
      serverRetryMs ??
      BASE_BACKOFF_MS * 2 ** (attempt - 1) * (0.5 + Math.random());
    serverRetryMs = null;
    await abortableDelay(delay, signal);
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
  signal?: AbortSignal;
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
    options.signal,
  );

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

  if (text.trim().length === 0) {
    throw new GeminiError("Gemini returned no content.");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new GeminiError("Gemini returned unparseable JSON.");
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
export async function embedTexts(
  texts: string[],
  signal?: AbortSignal,
): Promise<number[][]> {
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
      signal,
    );

    const embeddings = data.embeddings ?? [];
    if (embeddings.length !== slice.length) {
      throw new GeminiError(
        `Embedding count mismatch: asked for ${slice.length}, got ${embeddings.length}`,
      );
    }
    for (const embedding of embeddings) {
      const values = embedding.values ?? [];
      if (values.length !== EMBEDDING_DIMENSIONS) {
        throw new GeminiError(
          `Embedding dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${values.length}.`,
        );
      }
      if (values.some((value) => !Number.isFinite(value))) {
        throw new GeminiError("Embedding contained a non-finite value.");
      }
      out.push(values);
    }
  }

  return out;
}

/**
 * Runs `worker` over `items` with bounded concurrency, preserving input order.
 *
 * Forty answers fired at once trips the rate limit; six at a time keeps useful
 * concurrency while the rolling limiter controls request starts.
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
