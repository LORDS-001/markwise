import type {
  Cluster,
  DiagnosticResponse,
  DiagnosticVerdict,
  LearningChange,
  StudentAnswer,
} from "./types";

/**
 * The before/after figure — PRD v2 §12's primary metric.
 *
 * "Before" is what the run found: the students whose answers put them in this
 * cluster. "After" is what the diagnostic found among those same students.
 * Nobody else enters the calculation, because nobody else was intervened on.
 */

/**
 * Collapses one student's per-question verdicts into a verdict for the student.
 *
 * A single "holds" is enough to count them as still holding it. The two
 * questions are built so that a student who has corrected the belief passes
 * both (PRD v2 §5 step 6) — so failing either is evidence the belief survived,
 * not noise to be averaged away.
 */
export function verdictForStudent(
  verdicts: (DiagnosticVerdict | null)[],
): DiagnosticVerdict | null {
  const graded = verdicts.filter((v): v is DiagnosticVerdict => v !== null);
  if (graded.length === 0) return null;
  if (graded.includes("holds")) return "holds";
  if (graded.every((v) => v === "corrected")) return "corrected";
  return "unclear";
}

/**
 * Measures the change for every cluster that had an intervention available.
 *
 * Students who have not answered are counted as pending, never as corrected.
 * Folding them in either direction would report a result that was not
 * measured, in the one number the whole loop exists to produce.
 */
export function learningChange(
  clusters: Cluster[],
  answers: StudentAnswer[],
  responses: DiagnosticResponse[],
): LearningChange[] {
  const byAnswer = new Map<string, DiagnosticResponse[]>();
  for (const response of responses) {
    const list = byAnswer.get(response.answerId);
    if (list) list.push(response);
    else byAnswer.set(response.answerId, [response]);
  }

  return clusters
    .filter((cluster) => !cluster.isOther && cluster.memberIds.length > 0)
    .map((cluster) => {
      const members = answers.filter((a) => cluster.memberIds.includes(a.id));

      let completed = 0;
      let stillHolds = 0;
      let corrected = 0;
      let unclear = 0;

      for (const member of members) {
        const own = byAnswer.get(member.id) ?? [];
        if (own.length === 0) continue;

        completed += 1;
        const verdict = verdictForStudent(own.map((r) => r.verdict));
        // Answered but not yet graded counts as unclear rather than as a
        // result: the student did the work, the measurement did not land.
        if (verdict === "holds") stillHolds += 1;
        else if (verdict === "corrected") corrected += 1;
        else unclear += 1;
      }

      return {
        clusterId: cluster.id,
        clusterLabel: cluster.label,
        before: members.length,
        completed,
        stillHolds,
        corrected,
        unclear,
        pending: members.length - completed,
      };
    });
}

/**
 * Prevalence before and after, as percentages of the affected group.
 *
 * "After" is measured against the students who actually completed the
 * diagnostic, not against the whole cluster — dividing by students who never
 * answered would show the misconception collapsing simply because people did
 * not turn up.
 */
export function prevalence(change: LearningChange): {
  before: number;
  after: number | null;
} {
  const decided = change.stillHolds + change.corrected;
  return {
    before: 100,
    after: decided === 0 ? null : (change.stillHolds / decided) * 100,
  };
}
