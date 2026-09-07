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

export function isPipelineConfigured(): boolean {
  return missingPipelineKeys().length === 0;
}

/** A sentence naming what is missing, for the screen that has to explain it. */
export function pipelineConfigMessage(): string {
  const missing = missingPipelineKeys();
  if (missing.length === 0) return "";
  return `The marking pipeline is not configured on this deployment (missing ${missing.join(" and ")}). The seeded demo class still works.`;
}
