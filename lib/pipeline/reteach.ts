import type { Cluster, ReteachPack, StudentAnswer } from "@/lib/types";
import { generateJson } from "./gemini";
import { RETEACH_SCHEMA, reteachPrompt } from "./prompts";
import type { PipelineInput } from "./types";

interface RawReteach {
  lesson: { heading: string; body: string }[];
  diagnostics: {
    prompt: string;
    holder_answers: string;
    corrected_answers: string;
  }[];
}

/**
 * The pack shown when a cluster has no shared belief to teach against.
 *
 * Generating a lesson for the one-off bucket would imply a pattern that is not
 * there, which is worse than declining — so this is written, not modelled.
 */
export function otherBucketPack(clusterId: string, memberCount: number): ReteachPack {
  return {
    clusterId,
    lesson: [
      {
        heading: "No shared belief to teach against",
        body: `These ${memberCount} answers did not group with each other. Each failed for its own reason. A single reteach lesson would not fit them, and generating one would imply a pattern that is not there.`,
      },
      {
        heading: "What to do instead",
        body: "Open the cluster, read the answers, and handle them individually. If two of them turn out to share a cause you can see but the model did not, split them out into a named cluster and the reteach pack becomes available.",
      },
    ],
    diagnostics: [],
  };
}

/**
 * Generates a five-minute micro-lesson and a two-question diagnostic for one
 * cluster — PRD §6 step 6.
 *
 * Evidence is drawn from the cluster's own member answers so the lesson argues
 * against what these students actually wrote, not against the misconception in
 * the abstract.
 */
export async function generateReteachPack(
  input: PipelineInput,
  cluster: Cluster,
  members: StudentAnswer[],
): Promise<ReteachPack> {
  if (cluster.isOther) {
    return otherBucketPack(cluster.id, cluster.memberIds.length);
  }

  const evidence = members
    .map((m) => m.evidenceSpan ?? m.errorSignature ?? "")
    .filter((e) => e.trim().length > 0)
    .slice(0, 6);

  const raw = await generateJson<RawReteach>({
    prompt: reteachPrompt(input, cluster.label, cluster.why, evidence),
    schema: RETEACH_SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.4,
  });

  return {
    clusterId: cluster.id,
    lesson: (raw.lesson ?? [])
      .filter((s) => s?.heading?.trim() && s?.body?.trim())
      .map((s) => ({ heading: s.heading.trim(), body: s.body.trim() })),
    diagnostics: (raw.diagnostics ?? [])
      .filter((d) => d?.prompt?.trim())
      .map((d) => ({
        prompt: d.prompt.trim(),
        holderAnswers: (d.holder_answers ?? "").trim(),
        correctedAnswers: (d.corrected_answers ?? "").trim(),
      })),
  };
}
