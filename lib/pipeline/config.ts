import { anthropicApiKey, anthropicWorkspaceId } from "./claude";
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

/**
 * An identity-linked key needs a workspace id on every request. Whether a key
 * is identity-linked is not visible from the key itself, so this cannot be
 * checked up front — it is reported when the API rejects the call.
 */
export function workspaceHint(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes("anthropic-workspace-id")) return null;
  return "This Anthropic key is identity-linked, so it needs ANTHROPIC_WORKSPACE_ID in .env.local. Find it in the Console under Settings, Workspaces.";
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
