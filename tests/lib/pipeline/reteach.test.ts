// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const generateJson = vi.hoisted(() => vi.fn());
vi.mock("@/lib/pipeline/gemini", () => ({ generateJson }));

const input = {
  question: "Why does current fall?",
  scheme: "Explain impedance.",
  criteria: [{ id: "c-1", label: "Names impedance", marks: 1 }],
  subject: "Engineering",
  level: "300",
  answers: [],
};
const cluster = {
  id: "cluster-1",
  tone: 1 as const,
  label: "Impedance equals resistance",
  why: "The symbols look related.",
  memberIds: ["answer-1"],
  severity: 3,
  downstream: [],
  isOther: false,
};

beforeEach(() => generateJson.mockReset());

describe("generateReteachPack", () => {
  it("rejects a partial lesson instead of persisting a malformed pack", async () => {
    generateJson.mockResolvedValue({
      lesson: [{ heading: "Belief", body: "Name it." }],
      diagnostics: [
        { prompt: "One?", holder_answers: "Wrong", corrected_answers: "Right" },
        { prompt: "Two?", holder_answers: "Wrong", corrected_answers: "Right" },
      ],
    });
    const { generateReteachPack } = await import("@/lib/pipeline/reteach");

    await expect(generateReteachPack(input, cluster, [])).rejects.toThrow(/five/i);
  });

  it("rejects diagnostics with missing comparison answers", async () => {
    generateJson.mockResolvedValue({
      lesson: Array.from({ length: 5 }, (_, index) => ({
        heading: `Section ${index + 1}`,
        body: "Content",
      })),
      diagnostics: [
        { prompt: "One?", holder_answers: "", corrected_answers: "Right" },
        { prompt: "Two?", holder_answers: "Wrong", corrected_answers: "Right" },
      ],
    });
    const { generateReteachPack } = await import("@/lib/pipeline/reteach");

    await expect(generateReteachPack(input, cluster, [])).rejects.toThrow(/diagnostic/i);
  });
});
