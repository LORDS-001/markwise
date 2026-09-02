import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type * as z from "zod";

/**
 * Claude client for the four generative stages — PRD §9 names "Gemini or
 * Claude", and this is the Claude half: extraction, labelling, prerequisite
 * damage, and reteach packs.
 *
 * Embeddings stay on Gemini (see gemini.ts). Anthropic publishes no embedding
 * model, and clustering needs vectors — so the split is forced, not a
 * preference.
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

/**
 * Requests per rolling minute. Anthropic's first usage tier is well above
 * this; the limiter exists so a 40-answer batch degrades into waiting rather
 * than into a wall of 429s. Raise with ANTHROPIC_RPM on a higher tier.
 */
function requestsPerMinute(): number {
  const configured = Number(process.env.ANTHROPIC_RPM);
  return Number.isFinite(configured) && configured > 0 ? configured : 40;
}

const recentRequests: number[] = [];

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
    await new Promise((resolve) =>
      setTimeout(resolve, 60_000 - (now - recentRequests[0]) + 50),
    );
  }
}

export function anthropicApiKey(): string | null {
  if (typeof window !== "undefined") {
    throw new Error(
      "The Markwise pipeline must not run in the browser. Call it from a route handler or server action.",
    );
  }
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

/**
 * Identity-linked API keys act inside a specific workspace and reject every
 * request that does not name one. The id is not discoverable from the key —
 * even `/v1/models` refuses — so it has to be configured.
 */
export function anthropicWorkspaceId(): string | null {
  const id = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return id && id.length > 0 ? id : null;
}

let cached: Anthropic | null = null;

function client(): Anthropic {
  const key = anthropicApiKey();
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local to run the pipeline.",
    );
  }

  const workspaceId = anthropicWorkspaceId();

  // maxRetries 0: retries are handled here so the rate limiter sees every
  // attempt. Letting the SDK retry underneath it would silently exceed the
  // budget the limiter is enforcing.
  cached ??= new Anthropic({
    apiKey: key,
    maxRetries: 0,
    ...(workspaceId
      ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } }
      : {}),
  });
  return cached;
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
  const header = (error.headers as Record<string, string> | undefined)?.[
    "retry-after"
  ];
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.min(seconds * 1000 + 250, 65_000);
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
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await waitForSlot();

    try {
      const response = await client().messages.parse({
        model: CLAUDE_MODEL,
        max_tokens: request.maxTokens ?? 4096,
        // Thinking stays on. Disabling it on Opus 5 risks tool calls and
        // internal tags leaking into visible text; lowering effort is the
        // supported way to spend less.
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
      });

      if (response.stop_reason === "refusal") {
        throw new Error(
          `Claude declined to mark this answer (${response.stop_details?.category ?? "unspecified"}).`,
        );
      }

      const parsed = response.parsed_output;
      if (!parsed) {
        throw new Error("Claude returned no parseable output.");
      }
      return parsed;
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === MAX_ATTEMPTS) throw error;

      const delay =
        retryAfterMs(error) ??
        BASE_BACKOFF_MS * 2 ** (attempt - 1) * (0.5 + Math.random());
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error("Claude request failed");
}
