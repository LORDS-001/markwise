import { describe, expect, it } from "vitest";
import {
  learningChange,
  prevalence,
  responsesForOutcome,
  verdictForStudent,
} from "@/lib/learning-change";
import type { Cluster, DiagnosticResponse, StudentAnswer } from "@/lib/types";

/**
 * The before/after figure is PRD v2 §12's primary metric and the claim the
 * whole product rests on. Every test here is about one thing: it must not
 * report improvement that was not measured.
 */

function answer(id: string, clusterId: string | null): StudentAnswer {
  return {
    id,
    studentId: `EEE/${id}`,
    initials: "AB",
    answer: "…",
    isCorrect: clusterId === null,
    clusterId,
    errorSignature: clusterId ? "believes X" : null,
    evidenceSpan: null,
    confidence: 0.8,
    provisionalScore: 4,
    maxScore: 10,
    criteriaMet: [],
    criteriaMissed: [],
    scoreRationale: "",
    status: "unreviewed",
  };
}

function cluster(id: string, memberIds: string[], isOther = false): Cluster {
  return {
    id,
    tone: 1,
    label: `Cluster ${id}`,
    why: "",
    memberIds,
    severity: 3,
    downstream: [],
    isOther,
  };
}

function response(
  answerId: string,
  questionIndex: number,
  verdict: DiagnosticResponseVerdict,
): DiagnosticResponse {
  return {
    answerId,
    questionIndex,
    responseText: "…",
    verdict,
    rationale: "",
  };
}
type DiagnosticResponseVerdict = DiagnosticResponse["verdict"];

describe("verdictForStudent", () => {
  it("is null when nothing has been graded", () => {
    expect(verdictForStudent([null, null])).toBeNull();
    expect(verdictForStudent([])).toBeNull();
  });

  it("counts the student as still holding it if either question shows it", () => {
    // The pair is built so a corrected student passes both, so failing one is
    // evidence the belief survived — not noise to average away.
    expect(verdictForStudent(["holds", "corrected"])).toBe("holds");
    expect(verdictForStudent(["corrected", "holds"])).toBe("holds");
  });

  it("counts them as corrected only when every question is", () => {
    expect(verdictForStudent(["corrected", "corrected"])).toBe("corrected");
    expect(verdictForStudent(["corrected", "unclear"])).toBe("unclear");
  });

  it("does not classify an incomplete or partly ungraded attempt as corrected", () => {
    expect(verdictForStudent(["corrected"])).toBeNull();
    expect(verdictForStudent(["corrected", null])).toBeNull();
  });

  it("does not let an unclear answer become a correction", () => {
    expect(verdictForStudent(["unclear", "unclear"])).toBe("unclear");
    expect(verdictForStudent(["unclear"])).not.toBe("corrected");
  });
});

describe("learningChange", () => {
  const CLUSTERS = [cluster("cl-1", ["a", "b", "c"]), cluster("cl-other", ["d"], true)];
  const ANSWERS = [
    answer("a", "cl-1"),
    answer("b", "cl-1"),
    answer("c", "cl-1"),
    answer("d", "cl-other"),
  ];

  it("counts the affected group as the before figure", () => {
    const [change] = learningChange(CLUSTERS, ANSWERS, []);
    expect(change.before).toBe(3);
    expect(change.completed).toBe(0);
    expect(change.pending).toBe(3);
  });

  it("leaves the one-off bucket out — there was no intervention to measure", () => {
    const changes = learningChange(CLUSTERS, ANSWERS, []);
    expect(changes).toHaveLength(1);
    expect(changes[0].clusterId).toBe("cl-1");
  });

  it("splits completions into corrected, still-holding and unclear", () => {
    const [change] = learningChange(CLUSTERS, ANSWERS, [
      response("a", 0, "corrected"),
      response("a", 1, "corrected"),
      response("b", 0, "holds"),
      response("b", 1, "corrected"),
      response("c", 0, "unclear"),
      response("c", 1, "unclear"),
    ]);

    expect(change.completed).toBe(3);
    expect(change.corrected).toBe(1);
    expect(change.stillHolds).toBe(1);
    expect(change.unclear).toBe(1);
    expect(change.pending).toBe(0);
  });

  it("never counts a student who did not answer as corrected", () => {
    // The failure that would matter most: a low completion rate rendering as
    // a large improvement.
    const [change] = learningChange(CLUSTERS, ANSWERS, [
      response("a", 0, "corrected"),
      response("a", 1, "corrected"),
    ]);

    expect(change.corrected).toBe(1);
    expect(change.pending).toBe(2);
    expect(change.corrected + change.stillHolds + change.unclear).toBe(
      change.completed,
    );
  });

  it("counts an answered but ungraded response as unclear, not as a result", () => {
    const [change] = learningChange(CLUSTERS, ANSWERS, [
      response("a", 0, null),
      response("a", 1, null),
    ]);

    expect(change.completed).toBe(1);
    expect(change.unclear).toBe(1);
    expect(change.corrected).toBe(0);
    expect(change.stillHolds).toBe(0);
  });

  it("ignores responses from students outside the cluster", () => {
    const [change] = learningChange(CLUSTERS, ANSWERS, [
      response("d", 0, "corrected"),
      response("d", 1, "corrected"),
    ]);
    expect(change.completed).toBe(0);
  });
});

describe("prevalence", () => {
  const base = {
    clusterId: "cl-1",
    clusterLabel: "Cluster",
    before: 10,
    completed: 0,
    stillHolds: 0,
    corrected: 0,
    unclear: 0,
    pending: 10,
  };

  it("reports nothing after when nothing was decided", () => {
    expect(prevalence(base).after).toBeNull();
    expect(prevalence({ ...base, completed: 2, unclear: 2, pending: 8 }).after).toBeNull();
  });

  it("measures against decided answers, not the whole cluster", () => {
    // Two of ten answered; one still holds it. Prevalence after is 50%, not
    // 10% — dividing by students who never answered would show the
    // misconception collapsing because people did not turn up.
    const after = prevalence({
      ...base,
      completed: 2,
      stillHolds: 1,
      corrected: 1,
      pending: 8,
    }).after;
    expect(after).toBe(50);
  });

  it("reports a full correction as zero", () => {
    expect(
      prevalence({ ...base, completed: 4, corrected: 4, pending: 6 }).after,
    ).toBe(0);
  });

  it("starts from the whole affected group", () => {
    expect(prevalence(base).before).toBe(100);
  });
});

describe("responsesForOutcome", () => {
  it("ignores browser-local verdicts for a saved run", () => {
    const local = [response("a", 0, "corrected")];
    const remote = [response("a", 0, "holds")];

    expect(responsesForOutcome(false, local, remote)).toEqual(remote);
  });

  it("uses browser-local responses only for the credential-free demo", () => {
    const local = [response("a", 0, null)];
    expect(responsesForOutcome(true, local, [])).toEqual(local);
  });
});
