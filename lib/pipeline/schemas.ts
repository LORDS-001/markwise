import { z } from "zod";

/**
 * Response shapes for the four generative stages.
 *
 * Zod rather than hand-written JSON Schema: the same declaration constrains
 * what Claude may return, validates what came back, and types it — so a
 * malformed response fails at the boundary instead of halfway through
 * assembling a lecturer's marking.
 */

export const ExtractionSchema = z.object({
  is_correct: z.boolean(),
  error_signature: z
    .string()
    .describe(
      "The false belief, starting with the word believes. Empty when the answer is correct or cannot be diagnosed.",
    ),
  confidence: z.number().describe("0 to 1. Below 0.7 forces human review."),
  evidence_span: z
    .string()
    .describe("Verbatim substring of the answer. Empty when none applies."),
  provisional_score: z.number().int(),
  criteria_met: z.array(z.string()).describe("Criterion ids awarded."),
  criteria_missed: z.array(z.string()).describe("Criterion ids not awarded."),
  score_rationale: z.string(),
});

export const LabelSchema = z.object({
  label: z
    .string()
    .describe("One canonical misconception, under 90 characters."),
  why: z.string().describe("One sentence on why students plausibly hold it."),
});

export const DamageSchema = z.object({
  downstream: z
    .array(z.string())
    .describe("1 to 4 named later topics this belief will break."),
  severity: z.number().int().describe("1 to 5."),
});

export const ReteachSchema = z.object({
  lesson: z.array(
    z.object({
      heading: z.string(),
      body: z.string(),
    }),
  ),
  diagnostics: z.array(
    z.object({
      prompt: z.string(),
      holder_answers: z
        .string()
        .describe("What a student who still holds the misconception answers."),
      corrected_answers: z
        .string()
        .describe("What a student who has corrected it answers."),
    }),
  ),
});

export type ExtractionResponse = z.infer<typeof ExtractionSchema>;
export type LabelResponse = z.infer<typeof LabelSchema>;
export type DamageResponse = z.infer<typeof DamageSchema>;
export type ReteachResponse = z.infer<typeof ReteachSchema>;
