import { describe, expect, it } from "vitest";
import { buildRows, classStats, provenanceLine } from "@/lib/export";
import type { Cluster, StudentAnswer } from "@/lib/types";

function answer(over: Partial<StudentAnswer> = {}): StudentAnswer {
  return {
    id: "a-01",
    studentId: "EEE/1",
    initials: "AB",
    answer: "Z = R so I = 8 A",
    isCorrect: false,
    clusterId: "cl-1",
    errorSignature: "believes impedance equals resistance",
    evidenceSpan: "Z = R",
    confidence: 0.8,
    provisionalScore: 4,
    maxScore: 10,
    criteriaMet: ["c-units"],
    criteriaMissed: ["c-quad"],
    scoreRationale: "Units stated, quadrature missed.",
    status: "accepted",
    ...over,
  };
}

function cluster(over: Partial<Cluster> = {}): Cluster {
  return {
    id: "cl-1",
    tone: 1,
    label: "Impedance is treated as resistance",
    why: "DC intuition carried forward.",
    memberIds: ["a-01"],
    severity: 3,
    downstream: ["Resonance"],
    isOther: false,
    ...over,
  };
}

const CRITERIA = [
  { id: "c-quad", label: "Impedance combined in quadrature", marks: 3 },
  { id: "c-units", label: "Units stated throughout", marks: 1 },
];

describe("buildRows", () => {
  it("names the cluster a student fell into", () => {
    const [row] = buildRows([answer()], [cluster()], CRITERIA);
    expect(row.misconception).toBe("Impedance is treated as resistance");
  });

  it("marks a correct answer as having no misconception", () => {
    const [row] = buildRows(
      [answer({ isCorrect: true, clusterId: null })],
      [cluster()],
      CRITERIA,
    );
    expect(row.misconception).toBe("None — answer correct");
  });

  it("says unassigned when the cluster no longer exists", () => {
    const [row] = buildRows([answer({ clusterId: "cl-gone" })], [cluster()], CRITERIA);
    expect(row.misconception).toBe("Unassigned");
  });

  it("resolves missed criteria against this run's scheme, not the demo's", () => {
    // The lecturer's own criterion ids. Resolving against the seeded demo
    // scheme would print the raw id here, which reads on the registry
    // spreadsheet as an unexplained deduction.
    const [row] = buildRows(
      [answer({ criteriaMissed: ["own-1", "own-2"] })],
      [cluster()],
      [
        { id: "own-1", label: "States the assumption", marks: 2 },
        { id: "own-2", label: "Converts units", marks: 1 },
      ],
    );
    expect(row.criteriaMissed).toBe("States the assumption; Converts units");
  });

  it("computes percentage to one decimal place", () => {
    const [row] = buildRows(
      [answer({ provisionalScore: 1, maxScore: 3 })],
      [cluster()],
      CRITERIA,
    );
    expect(row.percentage).toBe(33.3);
  });

  it("renders review status in words, not codes", () => {
    const [row] = buildRows([answer({ status: "edited" })], [cluster()], CRITERIA);
    expect(row.status).toBe("Edited by lecturer");
  });
});

describe("classStats", () => {
  const rowsWithScores = (scores: number[], max = 10) =>
    buildRows(
      scores.map((score, i) =>
        answer({ id: `a-${i}`, provisionalScore: score, maxScore: max }),
      ),
      [cluster({ memberIds: scores.map((_, i) => `a-${i}`) })],
      CRITERIA,
    );

  it("averages the scores", () => {
    expect(classStats(rowsWithScores([2, 4, 6])).mean).toBeCloseTo(4);
  });

  it("takes the middle score for an odd count", () => {
    expect(classStats(rowsWithScores([1, 5, 9])).median).toBe(5);
  });

  it("averages the middle pair for an even count", () => {
    expect(classStats(rowsWithScores([1, 4, 6, 9])).median).toBe(5);
  });

  it("counts a pass at 40 percent or above", () => {
    // 4/10 passes, 3/10 does not.
    expect(classStats(rowsWithScores([4, 3])).passRate).toBe(50);
  });

  it("survives an empty class without dividing by zero", () => {
    const stats = classStats([]);
    expect(stats.mean).toBe(0);
    expect(stats.median).toBe(0);
    expect(stats.passRate).toBe(0);
    expect(Number.isNaN(stats.mean)).toBe(false);
  });

  it("accounts for every student in the distribution", () => {
    const rows = rowsWithScores([0, 3, 5, 7, 10]);
    const counted = classStats(rows).distribution.reduce(
      (sum, band) => sum + band.count,
      0,
    );
    expect(counted).toBe(rows.length);
  });

  it("accounts for every student when the paper is not out of ten", () => {
    // Bands fixed to 0-10 silently drop every score above 10, so a 20-mark
    // paper would export a distribution that does not add up to the class.
    const rows = rowsWithScores([0, 5, 12, 18, 20], 20);
    const counted = classStats(rows).distribution.reduce(
      (sum, band) => sum + band.count,
      0,
    );
    expect(counted).toBe(rows.length);
  });
});

describe("provenanceLine", () => {
  it("names the lecturer and the date", () => {
    const line = provenanceLine("Dr. A. Daniel");
    expect(line).toContain("Dr. A. Daniel");
    expect(line).toMatch(/generated with AI assistance/i);
    expect(line).toMatch(/\d{4}/);
  });
});
