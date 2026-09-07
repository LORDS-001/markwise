import { z } from "zod";

/**
 * Response shapes for the generative stages.
 *
 * Zod rather than hand-written JSON Schema: the same declaration constrains
 * what Claude may return, validates what came back, and types it — so a
 * malformed response fails at the boundary instead of halfway through
 * assembling a lecturer's marking.
 *
 * These describe the shape only. Whether the content can be trusted is a
 * separate question, settled in normaliseExtraction and its neighbours: the
 * model proposing a score does not make the score right.
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

/**
 * Labelling and damage ranking in one shape, because they are one call.
 *
 * They share all their context, and splitting them doubled the per-cluster
 * request count for no gain — which mattered against the route's request
 * budget, not just the bill.
 */
export const ClusterAssessmentSchema = z.object({
  label: z
    .string()
    .describe("One canonical misconception, under 90 characters."),
  why: z.string().describe("One sentence on why students plausibly hold it."),
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

/**
 * One verdict per diagnostic question, in the order they were asked.
 *
 * The enum is enforced at the boundary rather than mapped afterwards, so a
 * fourth verdict the model invented is a parse failure instead of something
 * that quietly becomes "corrected" and inflates the improvement figure.
 */
export const GradingSchema = z.object({
  verdicts: z.array(
    z.object({
      verdict: z.enum(["holds", "corrected", "unclear"]),
      rationale: z
        .string()
        .describe("One sentence, quoting the phrase that decided it."),
    }),
  ),
});

export type ExtractionResponse = z.infer<typeof ExtractionSchema>;
export type ClusterAssessmentResponse = z.infer<typeof ClusterAssessmentSchema>;
export type ReteachResponse = z.infer<typeof ReteachSchema>;
export type GradingResponse = z.infer<typeof GradingSchema>;
