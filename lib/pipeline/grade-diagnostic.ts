import { claudeJson } from "./claude";
import {
  diagnosticGradingContext,
  diagnosticGradingResponses,
} from "./prompts";
import { GradingSchema } from "./schemas";
import type { DiagnosticVerdict } from "@/lib/types";

/**
 * Grades one student's diagnostic — PRD v2 §5 step 8.
 *
 * Free text rather than a choice between two options, so the measurement is of
 * recall rather than recognition. That costs a model call per student, which
 * is why both questions are graded together in one.
 */

export interface GradedResponse {
  verdict: DiagnosticVerdict;
  rationale: string;
}

const VALID: DiagnosticVerdict[] = ["holds", "corrected", "unclear"];

function normaliseVerdict(value: string): DiagnosticVerdict {
  const lower = (value ?? "").trim().toLowerCase() as DiagnosticVerdict;
  // Anything unrecognised becomes unclear rather than defaulting either way.
  // Defaulting to "corrected" would invent improvement; defaulting to "holds"
  // would invent failure. Neither was measured.
  return VALID.includes(lower) ? lower : "unclear";
}

/**
 * Returns one verdict per question, in the order the questions were asked.
 *
 * A blank answer is graded as unclear without a model call — there is nothing
 * to judge, and spending quota to be told so is waste.
 */
export async function gradeDiagnostic(params: {
  misconception: string;
  questions: {
    prompt: string;
    holderAnswers: string;
    correctedAnswers: string;
  }[];
  responses: string[];
}): Promise<GradedResponse[]> {
  const { misconception, questions, responses } = params;

  if (questions.length === 0) return [];

  const answered = responses.some((r) => (r ?? "").trim().length > 0);
  if (!answered) {
    return questions.map(() => ({
      verdict: "unclear" as const,
      rationale: "No answer was given.",
    }));
  }

  const raw = await claudeJson({
    // Identical for every student in the cohort, so the whole class after the
    // first is graded against a cached prefix.
    stable: diagnosticGradingContext(misconception, questions),
    variable: diagnosticGradingResponses(responses),
    schema: GradingSchema,
    // Judging the belief behind a wrong number, rather than the number, is
    // the distinction this whole measurement rests on.
    effort: "medium",
  });

  return questions.map((_, index) => {
    const entry = raw.verdicts?.[index];
    // A missing verdict is a grader failure, not a student outcome. Unclear
    // keeps it out of both sides of the before/after figure.
    if (!entry) {
      return {
        verdict: "unclear" as const,
        rationale: "The grader returned no verdict for this question.",
      };
    }
    return {
      verdict: normaliseVerdict(entry.verdict),
      rationale: (entry.rationale ?? "").trim(),
    };
  });
}
