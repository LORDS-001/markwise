import { anthropicApiKey } from "./claude";
import { geminiApiKey } from "./gemini";

/**
 * The pipeline needs both providers: Claude for the four generative stages,
 * Gemini for signature embeddings. Anthropic publishes no embedding model, so
 * one key is not enough however capable it is.
 */
export function missingPipelineKeys(): string[] {
  const missing: string[] = [];
  if (!anthropicApiKey()) missing.push("ANTHROPIC_API_KEY");
  if (!geminiApiKey()) missing.push("GEMINI_API_KEY");
  return missing;
}

/** Both providers — only a full run needs both. */
export function isPipelineConfigured(): boolean {
  return missingPipelineKeys().length === 0;
}

/**
 * Whether the generative half alone is configured.
 *
 * Reteach packs and diagnostic grading run entirely on Claude — they never
 * embed anything. Gating them on the embedding key would refuse work that
 * would have succeeded, which is how a lecturer gets told their diagnostic
 * cannot be marked because of a key it was never going to use.
 */
export function isGenerativeConfigured(): boolean {
  return anthropicApiKey() !== null;
}

/** A sentence naming what is missing, for the screen that has to explain it. */
export function pipelineConfigMessage(): string {
  const missing = missingPipelineKeys();
  if (missing.length === 0) return "";
  return `The marking pipeline is not configured on this deployment (missing ${missing.join(" and ")}). The seeded demo class still works.`;
}

/** The same sentence for the stages that need Claude but not embeddings. */
export function generativeConfigMessage(): string {
  if (isGenerativeConfigured()) return "";
  return "The marking pipeline is not configured on this deployment (missing ANTHROPIC_API_KEY). The seeded demo class still works.";
}
