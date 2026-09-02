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
import { generateJson, isPipelineConfigured } from "@/lib/pipeline/gemini";
import {
  EXTRACTION_SCHEMA,
  extractionPrompt,
  extractionSystemPrompt,
} from "@/lib/pipeline/prompts";
import type { PipelineInput } from "@/lib/pipeline/types";

async function main() {
  if (!isPipelineConfigured()) {
    console.error("GEMINI_API_KEY is not set.");
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
    const result = await generateJson({
      system: extractionSystemPrompt(),
      prompt: extractionPrompt(input, answer),
      schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.1,
    });
    console.log("SUCCESS:\n", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("FAILED:\n", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

void main();
