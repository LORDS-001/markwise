// @vitest-environment node
//
// Touches the pipeline, which refuses to initialise where a `window` exists.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Grading a student's diagnostic — PRD v2 §5 step 8.
 *
 * Every test here is about the same risk: a verdict the grader did not
 * actually give must never become a result. "corrected" invented from a
 * malformed response is improvement the lecturer never achieved, in the one
 * number the whole loop produces.
 */

const generateJson = vi.hoisted(() => vi.fn());
vi.mock("@/lib/pipeline/gemini", () => ({ generateJson }));

const QUESTIONS = [
  {
    prompt: "What is the phase angle in a purely resistive AC circuit?",
    holderAnswers: "Gives a non-zero angle, measured against resistance.",
    correctedAnswers: "Zero; the question is not meaningful for resistance.",
  },
  {
    prompt: "Sketch the phasor diagram and label the reference.",
    holderAnswers: "Labels R as the reference phasor.",
    correctedAnswers: "Takes the current as the reference.",
  },
];

async function grade(responses: string[]) {
  const { gradeDiagnostic } = await import("@/lib/pipeline/grade-diagnostic");
  return gradeDiagnostic({
    misconception: "Impedance is treated as resistance",
    questions: QUESTIONS,
    responses,
  });
}

beforeEach(() => {
  vi.resetModules();
  generateJson.mockReset();
  process.env.GEMINI_API_KEY = "test-key";
});

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

describe("gradeDiagnostic", () => {
  it("returns one verdict per question, in order", async () => {
    generateJson.mockResolvedValue({
      verdicts: [
        { verdict: "corrected", rationale: "Says zero." },
        { verdict: "holds", rationale: "Labels R as reference." },
      ],
    });

    const graded = await grade(["Zero.", "R is the reference."]);
    expect(graded).toHaveLength(2);
    expect(graded[0].verdict).toBe("corrected");
    expect(graded[1].verdict).toBe("holds");
    expect(graded[1].rationale).toBe("Labels R as reference.");
  });

  it("grades both questions in one call, not one call each", async () => {
    // Forty students at two calls apiece is eighty; the pair share all their
    // context, so there is no reason to pay twice.
    generateJson.mockResolvedValue({
      verdicts: [
        { verdict: "corrected", rationale: "" },
        { verdict: "corrected", rationale: "" },
      ],
    });

    await grade(["a", "b"]);
    expect(generateJson).toHaveBeenCalledTimes(1);
  });

  it("marks a blank submission unclear without spending a call", async () => {
    const graded = await grade(["", "   "]);

    expect(generateJson).not.toHaveBeenCalled();
    expect(graded.map((g) => g.verdict)).toEqual(["unclear", "unclear"]);
  });

  it("treats an unrecognised verdict as unclear, never as a correction", async () => {
    generateJson.mockResolvedValue({
      verdicts: [
        { verdict: "mostly right", rationale: "" },
        { verdict: "PASS", rationale: "" },
      ],
    });

    const graded = await grade(["a", "b"]);
    expect(graded.map((g) => g.verdict)).toEqual(["unclear", "unclear"]);
  });

  it("accepts a verdict whatever its casing or padding", async () => {
    generateJson.mockResolvedValue({
      verdicts: [
        { verdict: " Corrected ", rationale: "" },
        { verdict: "HOLDS", rationale: "" },
      ],
    });

    const graded = await grade(["a", "b"]);
    expect(graded.map((g) => g.verdict)).toEqual(["corrected", "holds"]);
  });

  it("fills a missing verdict with unclear rather than dropping the question", async () => {
    // A short array would otherwise misalign every later question against the
    // wrong answer.
    generateJson.mockResolvedValue({
      verdicts: [{ verdict: "corrected", rationale: "Only one returned." }],
    });

    const graded = await grade(["a", "b"]);
    expect(graded).toHaveLength(2);
    expect(graded[1].verdict).toBe("unclear");
    expect(graded[1].rationale).toMatch(/no verdict/i);
  });

  it("survives a response with no verdicts at all", async () => {
    generateJson.mockResolvedValue({});

    const graded = await grade(["a", "b"]);
    expect(graded.map((g) => g.verdict)).toEqual(["unclear", "unclear"]);
  });

  it("returns nothing when there are no questions", async () => {
    const { gradeDiagnostic } = await import("@/lib/pipeline/grade-diagnostic");
    const graded = await gradeDiagnostic({
      misconception: "x",
      questions: [],
      responses: [],
    });
    expect(graded).toEqual([]);
    expect(generateJson).not.toHaveBeenCalled();
  });

  it("lets a grader failure propagate rather than inventing verdicts", async () => {
    // The caller records the answers and tells the student marking failed.
    // Returning a fabricated verdict here would silently enter the metric.
    generateJson.mockRejectedValue(new Error("Gemini 429: quota"));
    await expect(grade(["a", "b"])).rejects.toThrow(/429/);
  });

  it("grades a partly answered submission rather than refusing it", async () => {
    generateJson.mockResolvedValue({
      verdicts: [
        { verdict: "corrected", rationale: "Answered." },
        { verdict: "unclear", rationale: "Left blank." },
      ],
    });

    const graded = await grade(["Zero degrees.", ""]);
    expect(generateJson).toHaveBeenCalledTimes(1);
    expect(graded[0].verdict).toBe("corrected");
    expect(graded[1].verdict).toBe("unclear");
  });
});
