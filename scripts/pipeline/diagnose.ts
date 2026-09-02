/**
 * Surfaces the raw error from a single extraction call.
 *
 * runPipeline deliberately swallows a per-answer failure so one bad answer
 * cannot lose the other thirty-nine. That is right for a lecturer mid-batch
 * and wrong for tuning, where a systematic failure needs to be loud.
 *
 *   npm run pipeline:diagnose
 */

import { ANSWERS, CRITERIA, SESSION } from "@/lib/mock";
import { claudeJson } from "@/lib/pipeline/claude";
import {
  isPipelineConfigured,
  missingPipelineKeys,
  workspaceHint,
} from "@/lib/pipeline/config";
import {
  extractionAnswer,
  extractionContext,
  extractionSystemPrompt,
} from "@/lib/pipeline/prompts";
import { ExtractionSchema } from "@/lib/pipeline/schemas";
import type { PipelineInput } from "@/lib/pipeline/types";

async function main() {
  if (!isPipelineConfigured()) {
    console.error(`Missing ${missingPipelineKeys().join(" and ")}.`);
    process.exit(1);
  }

  const input: PipelineInput = {
    question: SESSION.question,
    scheme: "Full marks require the reactance computed from X_L = 2πfL.",
    criteria: CRITERIA,
    subject: SESSION.subject,
    level: SESSION.level,
    answers: [],
  };

  const answer = { studentRef: ANSWERS[0].studentId, text: ANSWERS[0].answer };

  console.log("Calling extraction for one answer, errors unswallowed…\n");
  try {
    const result = await claudeJson({
      stable: `${extractionSystemPrompt()}

${extractionContext(input)}`,
      variable: extractionAnswer(answer),
      schema: ExtractionSchema,
      effort: "low",
    });
    console.log("SUCCESS:\n", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("FAILED:\n", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

void main();
