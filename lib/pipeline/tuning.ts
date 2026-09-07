export interface TuningSample {
  signature: string;
  truth: string;
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
