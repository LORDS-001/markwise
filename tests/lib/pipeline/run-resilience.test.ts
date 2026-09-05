// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const generateJson = vi.hoisted(() => vi.fn());
const embedTexts = vi.hoisted(() => vi.fn());

vi.mock("@/lib/pipeline/gemini", () => ({
  CONCURRENCY: 2,
  generateJson,
  embedTexts,
  mapWithConcurrency: async <T, R>(
    items: T[],
    _limit: number,
    worker: (item: T, index: number) => Promise<R>,
  ) => Promise.all(items.map(worker)),
}));

const input = {
  question: "Explain impedance.",
  scheme: "Award one mark for impedance.",
  criteria: [{ id: "c-1", label: "Names impedance", marks: 1 }],
  subject: "Engineering",
  level: "300",
  answers: [
    { studentRef: "REAL-STUDENT-001", text: "Z equals R." },
    { studentRef: "REAL-STUDENT-002", text: "Reactance does not count." },
  ],
};

beforeEach(() => {
  generateJson.mockReset();
  embedTexts.mockReset();
  generateJson.mockImplementation(async () => ({
    is_correct: false,
    error_signature: "believes impedance equals resistance",
    confidence: 0.8,
    evidence_span: "",
    provisional_score: 0,
    criteria_met: [],
    criteria_missed: ["c-1"],
    score_rationale: "Does not name impedance.",
  }));
});

describe("runPipeline embedding fallback", () => {
  it("keeps answers reviewable and warns when embeddings are unavailable", async () => {
    embedTexts.mockRejectedValue(new Error("embedding outage"));
    const progress: { warning?: string }[] = [];
    const { runPipeline } = await import("@/lib/pipeline/run");

    const result = await runPipeline(input, (event) => progress.push(event));

    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].isOther).toBe(true);
    expect(result.answers.every((answer) => answer.clusterId === "cl-other")).toBe(true);
    expect(progress.some((event) => /embedding/i.test(event.warning ?? ""))).toBe(true);
  });

  it("uses correlation references instead of real student identifiers in prompts", async () => {
    embedTexts.mockResolvedValue([
      [1, ...Array.from({ length: 767 }, () => 0)],
      [0, 1, ...Array.from({ length: 766 }, () => 0)],
    ]);
    const { runPipeline } = await import("@/lib/pipeline/run");

    await runPipeline(input);

    const prompts = generateJson.mock.calls.map(([options]) => options.prompt).join("\n");
    expect(prompts).not.toContain("REAL-STUDENT-001");
    expect(prompts).not.toContain("REAL-STUDENT-002");
    expect(prompts).toContain("submission-1");
  });
});

describe("pipeline request admission", () => {
  it("bounds a worst-case 40-answer run at 61 paid requests", async () => {
    const { estimateMaximumPipelineRequests } = await import("@/lib/pipeline/run");
    expect(estimateMaximumPipelineRequests(40)).toBe(61);
  });

  it("labels and assesses each real cluster in one model request", async () => {
    const groupedInput = {
      ...input,
      answers: Array.from({ length: 4 }, (_, index) => ({
        studentRef: `student-${index}`,
        text: "Z equals R.",
      })),
    };
    generateJson.mockImplementation(async (options) => {
      const properties = (options.schema as { properties?: Record<string, unknown> })
        .properties;
      if (properties?.label) {
        return {
          label: "Impedance equals resistance",
          why: "Resistance is the familiar part of impedance.",
          downstream: ["RLC resonance"],
          severity: 4,
        };
      }
      return {
        is_correct: false,
        error_signature: "believes impedance equals resistance",
        confidence: 0.8,
        evidence_span: "",
        provisional_score: 0,
        criteria_met: [],
        criteria_missed: ["c-1"],
        score_rationale: "Does not name impedance.",
      };
    });
    embedTexts.mockResolvedValue(
      Array.from({ length: 4 }, () => [1, ...Array.from({ length: 767 }, () => 0)]),
    );
    const { runPipeline } = await import("@/lib/pipeline/run");

    const result = await runPipeline(groupedInput);

    expect(generateJson).toHaveBeenCalledTimes(5);
    expect(result.clusters[0]).toMatchObject({
      label: "Impedance equals resistance",
      downstream: ["RLC resonance"],
      severity: 4,
    });
  });
});
