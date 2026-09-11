export interface TuningSample {
  signature: string;
  truth: string;
}

export interface PairwiseScore {
  precision: number;
  recall: number;
  f1: number;
}

/**
 * Pairwise precision, recall and F1 against a known grouping.
 *
 * Of every pair of answers put together, how many genuinely share a belief;
 * and of every pair that genuinely shares one, how many were caught. A single
 * number for "are these clusters right" is what makes the threshold choice
 * defensible rather than eyeballed — and it is the same question asked of the
 * signatures upstream, so both measurements use this one implementation.
 */
export function pairwiseScore(
  groups: number[][],
  truth: string[],
): PairwiseScore {
  const assigned = new Array<number>(truth.length).fill(-1);
  groups.forEach((group, g) => group.forEach((i) => (assigned[i] = g)));

  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;

  for (let i = 0; i < truth.length; i += 1) {
    for (let j = i + 1; j < truth.length; j += 1) {
      const together = assigned[i] === assigned[j] && assigned[i] !== -1;
      // Singletons in the same one-off bucket do not genuinely share a belief,
      // so pairs inside it are not counted as pairs that should be together.
      const shouldBeTogether = truth[i] === truth[j] && truth[i] !== "cl-other";
      if (together && shouldBeTogether) truePositive += 1;
      else if (together && !shouldBeTogether) falsePositive += 1;
      else if (!together && shouldBeTogether) falseNegative += 1;
    }
  }

  const precision = truePositive / Math.max(1, truePositive + falsePositive);
  const recall = truePositive / Math.max(1, truePositive + falseNegative);
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

interface ExportedAnswer {
  studentId?: unknown;
  isCorrect?: unknown;
  errorSignature?: unknown;
}

/**
 * Builds threshold samples from a pipeline export and a separate set of human
 * labels. Pipeline cluster IDs are deliberately ignored: using them as truth
 * would only measure how well the pipeline reproduces its own output.
 */
export function samplesFromExport(
  run: unknown,
  humanLabels: Record<string, unknown> | null,
): TuningSample[] {
  if (!humanLabels) {
    throw new Error(
      "Human labels are required for exported runs. Supply a separate labels JSON file.",
    );
  }
  const answers = (run as { answers?: unknown } | null)?.answers;
  if (!Array.isArray(answers)) throw new Error("The run export has no answers array.");

  return (answers as ExportedAnswer[])
    .filter(
      (answer) =>
        answer.isCorrect === false &&
        typeof answer.errorSignature === "string" &&
        answer.errorSignature.trim().length > 0,
    )
    .map((answer) => {
      const studentId =
        typeof answer.studentId === "string" ? answer.studentId.trim() : "";
      const truth = studentId ? humanLabels[studentId] : undefined;
      if (typeof truth !== "string" || !truth.trim()) {
        throw new Error(`A human label is missing for ${studentId || "an exported answer"}.`);
      }
      return {
        signature: (answer.errorSignature as string).trim(),
        truth: truth.trim(),
      };
    });
}
