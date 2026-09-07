import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type * as z from "zod";
import {
  RATE_WINDOW_MS,
  abortableDelay,
  createRequestLimiter,
  throwIfAborted,
} from "./limiter";

/**
 * Claude client for the generative stages — PRD §9 names "Gemini or Claude",
 * and this is the Claude half: extraction, cluster assessment, reteach packs
 * and diagnostic grading.
 *
 * Embeddings stay on Gemini (see gemini.ts). Anthropic publishes no embedding
 * model and clustering needs vectors, so the split is forced, not preferred.
 */

/**
 * Claude Opus 5. Extraction quality is the whole product: a signature that
 * describes the answer instead of naming the belief cannot be recovered by any
 * later stage, so this is the wrong place to economise. Override per
 * deployment with ANTHROPIC_MODEL.
 */
export const CLAUDE_MODEL =
  process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5";

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 800;
const COMPLETION_RESERVE_MS = 25_000;

/**
 * Requests per rolling minute. Anthropic's first usage tier is well above
 * this; the limiter exists so a 40-answer batch degrades into waiting rather
 * than into a wall of 429s. Raise with ANTHROPIC_RPM on a higher tier.
 */
export function claudeRequestsPerMinute(): number {
  const configured = Number(process.env.ANTHROPIC_RPM);
  return Number.isFinite(configured) && configured >= 1
    ? Math.floor(configured)
    : 40;
}

/**
 * Request starts admissible inside the route's budget.
 *
 * The route admits a batch only if both providers can start the work it will
 * need. Claude's ceiling is the higher of the two, but it still has one, and a
 * batch that cannot finish should be refused up front rather than abandoned
 * two minutes in with half the class undiagnosed.
 */
export function claudeRequestCapacity(runBudgetMs: number): number {
  const usableMs = runBudgetMs - COMPLETION_RESERVE_MS;
  if (!Number.isFinite(usableMs) || usableMs < 0) return 0;
  const windows = Math.floor(usableMs / RATE_WINDOW_MS) + 1;
  return windows * claudeRequestsPerMinute();
}

const waitForSlot = createRequestLimiter({
  requestsPerMinute: claudeRequestsPerMinute,
  now: Date.now,
  sleep: abortableDelay,
});

export class ClaudeError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ClaudeError";
  }
}

export function anthropicApiKey(): string | null {
  // Hard stop rather than a silent null: reaching here in a browser means an
  // import chain has dragged the pipeline into the client bundle, and the
  // failure should be loud during development, not a mystery at runtime.
  if (typeof window !== "undefined") {
    throw new Error(
      "The Markwise pipeline must not run in the browser. Call it from a route handler or server action.",
    );
  }
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

let cached: { key: string; client: Anthropic } | null = null;

function client(): Anthropic {
  const key = anthropicApiKey();
  if (!key) {
    throw new ClaudeError(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local to run the pipeline.",
    );
  }
  // Keyed on the key itself: a test or a reload that swaps credentials must
  // not keep talking to the API as the previous identity.
  if (cached?.key !== key) {
    // maxRetries 0: retries are handled here so the rate limiter sees every
    // attempt. Letting the SDK retry underneath it would silently exceed the
    // budget the limiter is enforcing.
    cached = { key, client: new Anthropic({ apiKey: key, maxRetries: 0 }) };
  }
  return cached.client;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof Anthropic.RateLimitError) return true;
  if (error instanceof Anthropic.APIConnectionError) return true;
  if (error instanceof Anthropic.APIError) {
    return typeof error.status === "number" && error.status >= 500;
  }
  return false;
}

/** Honours the server's own Retry-After when it sends one. */
function retryAfterMs(error: unknown): number | null {
  if (!(error instanceof Anthropic.APIError)) return null;
  const headers = error.headers as unknown as
    | { get?: (name: string) => string | null }
    | undefined;
  const seconds = Number(headers?.get?.("retry-after"));
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.min(seconds * 1000 + 250, 65_000);
}

/**
 * Restates a provider failure as our own error.
 *
 * The provider's body can quote the prompt back, and the prompt carries the
 * marking scheme and a student's answer. Neither should travel outwards in a
 * string that ends up in a log or on a lecturer's screen, so only the status
 * survives.
 */
function asClaudeError(error: unknown): ClaudeError {
  if (error instanceof ClaudeError) return error;
  if (error instanceof Anthropic.APIError) {
    return new ClaudeError(
      `Claude request failed (status ${error.status ?? "unknown"}).`,
      typeof error.status === "number" ? error.status : undefined,
    );
  }
  return new ClaudeError("Claude request failed.");
}

export interface ClaudeJsonRequest<T extends z.ZodType> {
  /**
   * The part of the prompt that is identical for every call in a batch — the
   * instructions, the question, the marking scheme. Cached, so forty answers
   * pay for it once instead of forty times.
   */
  stable: string;
  /** The part that changes per call: one student's answer. */
  variable: string;
  schema: T;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  signal?: AbortSignal;
}

/**
 * One structured-JSON call, validated against a Zod schema.
 *
 * The stable half of the prompt carries a cache breakpoint. Caching is a
 * prefix match, so the wording that never changes has to come first and the
 * student's answer last — the reverse would make every call a cache miss.
 */
export async function claudeJson<T extends z.ZodType>(
  request: ClaudeJsonRequest<T>,
): Promise<z.infer<T>> {
  const { signal } = request;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    throwIfAborted(signal);
    await waitForSlot(signal);

    try {
      const response = await client().messages.parse(
        {
          model: CLAUDE_MODEL,
          // Thinking tokens count against this ceiling, so it has to leave
          // room for the reasoning as well as the JSON. Truncating mid-object
          // fails the parse and costs the whole call.
          max_tokens: request.maxTokens ?? 16_000,
          // Explicit rather than implied. Opus 5 thinks by default, but an
          // ANTHROPIC_MODEL override pointing at an earlier model would
          // silently stop thinking, and extraction quality would drop with
          // nothing in the code to explain why.
          thinking: { type: "adaptive" },
          output_config: {
            effort: request.effort ?? "low",
            format: zodOutputFormat(request.schema),
          },
          system: [
            {
              type: "text",
              text: request.stable,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content: request.variable }],
        },
        { signal },
      );

      if (response.stop_reason === "refusal") {
        // Not retryable: the same prompt will be declined the same way.
        throw new ClaudeError(
          `Claude declined to mark this answer (${response.stop_details?.category ?? "unspecified"}).`,
        );
      }

      const parsed = response.parsed_output;
      if (!parsed) {
        throw new ClaudeError("Claude returned no parseable output.");
      }
      return parsed;
    } catch (error) {
      if (signal?.aborted) throwIfAborted(signal);
      lastError = error;
      if (!isRetryable(error) || attempt === MAX_ATTEMPTS) {
        throw asClaudeError(error);
      }

      const delay =
        retryAfterMs(error) ??
        BASE_BACKOFF_MS * 2 ** (attempt - 1) * (0.5 + Math.random());
      await abortableDelay(delay, signal);
    }
  }

  throw asClaudeError(lastError);
}
