// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClusterAssessmentSchema,
  ExtractionSchema,
} from "@/lib/pipeline/schemas";

const claudeJson = vi.hoisted(() => vi.fn());
const embedTexts = vi.hoisted(() => vi.fn());

vi.mock("@/lib/pipeline/claude", () => ({ claudeJson }));

vi.mock("@/lib/pipeline/gemini", () => ({
  CONCURRENCY: 2,
  EMBEDDING_BATCH_SIZE: 100,
  embedTexts,
  mapWithConcurrency: async <T, R>(
    items: T[],
    _limit: number,
    worker: (item: T, index: number) => Promise<R>,
  ) => Promise.all(items.map(worker)),
}));

const EXTRACTION = {
  is_correct: false,
  error_signature: "believes impedance equals resistance",
  confidence: 0.8,
  evidence_span: "",
  provisional_score: 0,
  criteria_met: [],
  criteria_missed: ["c-1"],
  score_rationale: "Does not name impedance.",
};

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
  claudeJson.mockReset();
  embedTexts.mockReset();
  claudeJson.mockResolvedValue(EXTRACTION);
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

    const prompts = claudeJson.mock.calls
      .map(([options]) => `${options.stable}\n${options.variable}`)
      .join("\n");
    expect(prompts).not.toContain("REAL-STUDENT-001");
    expect(prompts).not.toContain("REAL-STUDENT-002");
    expect(prompts).toContain("submission-1");
  });

  it("sends the scheme as a cached prefix that is identical for every answer", async () => {
    embedTexts.mockResolvedValue([
      [1, ...Array.from({ length: 767 }, () => 0)],
      [0, 1, ...Array.from({ length: 766 }, () => 0)],
    ]);
    const { runPipeline } = await import("@/lib/pipeline/run");

    await runPipeline(input);

    // Caching is a prefix match, so the stable half has to be byte-identical
    // across answers and the answer text has to stay out of it. If either
    // slips, every call silently becomes a cache miss and the run costs
    // several times what it should.
    const extractions = claudeJson.mock.calls
      .map(([options]) => options)
      .filter((options) => options.schema === ExtractionSchema);

    expect(extractions).toHaveLength(2);
    expect(new Set(extractions.map((options) => options.stable)).size).toBe(1);
    expect(extractions[0].stable).toContain("Award one mark for impedance.");
    expect(extractions[0].stable).not.toContain("Z equals R.");
    expect(extractions[0].variable).toContain("Z equals R.");
  });
});

describe("pipeline request admission", () => {
  it("bounds a worst-case 40-answer run at 61 paid requests", async () => {
    const { estimateMaximumPipelineRequests } = await import("@/lib/pipeline/run");
    expect(estimateMaximumPipelineRequests(40)).toBe(61);
  });

  it("counts Claude and embedding requests against their own limits", async () => {
    const { estimateMaximumClaudeRequests, estimateMaximumEmbeddingRequests } =
      await import("@/lib/pipeline/run");

    // Claude carries one call per answer plus one per cluster; Gemini batches
    // every signature into a single embedding call. Charging the combined
    // total to either provider's limit would misjudge both.
    expect(estimateMaximumClaudeRequests(40)).toBe(60);
    expect(estimateMaximumEmbeddingRequests(40)).toBe(1);
  });

  it("labels and assesses each real cluster in one model request", async () => {
    const groupedInput = {
      ...input,
      answers: Array.from({ length: 4 }, (_, index) => ({
        studentRef: `student-${index}`,
        text: "Z equals R.",
      })),
    };
    claudeJson.mockImplementation(async (options) => {
      if (options.schema === ClusterAssessmentSchema) {
        return {
          label: "Impedance equals resistance",
          why: "Resistance is the familiar part of impedance.",
          downstream: ["RLC resonance"],
          severity: 4,
        };
      }
      return EXTRACTION;
    });
    embedTexts.mockResolvedValue(
      Array.from({ length: 4 }, () => [1, ...Array.from({ length: 767 }, () => 0)]),
    );
    const { runPipeline } = await import("@/lib/pipeline/run");

    const result = await runPipeline(groupedInput);

    expect(claudeJson).toHaveBeenCalledTimes(5);
    expect(result.clusters[0]).toMatchObject({
      label: "Impedance equals resistance",
      downstream: ["RLC resonance"],
      severity: 4,
    });
  });
});
