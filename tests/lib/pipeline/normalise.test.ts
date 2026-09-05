import { describe, expect, it } from "vitest";
import { normaliseExtraction } from "@/lib/pipeline/run";

const CRITERIA = [
  { id: "c-react", marks: 2 },
  { id: "c-quad", marks: 3 },
  { id: "c-units", marks: 1 },
];

const ANSWER = {
  studentRef: "EEE/1",
  text: "The opposition is just the resistance, so Z = R = 30 ohm and I = 8 A.",
};

function raw(over: Partial<Parameters<typeof normaliseExtraction>[0]> = {}) {
  return {
    is_correct: false,
    error_signature: "believes impedance equals resistance",
    confidence: 0.8,
    evidence_span: "Z = R = 30 ohm",
    provisional_score: 99,
    criteria_met: ["c-react"],
    criteria_missed: [],
    score_rationale: "Reactance recalled, then discarded.",
    ...over,
  };
}

describe("normaliseExtraction", () => {
  it("recomputes the score from the criteria awarded, ignoring the model's number", () => {
    // The model claimed 99 while awarding only the 2-mark criterion.
    const result = normaliseExtraction(raw(), ANSWER, CRITERIA);
    expect(result.provisionalScore).toBe(2);
  });

  it("makes met and missed partition every criterion exactly once", () => {
    const result = normaliseExtraction(
      raw({ criteria_met: ["c-react"], criteria_missed: [] }),
      ANSWER,
      CRITERIA,
    );
    expect(result.criteriaMet).toEqual(["c-react"]);
    expect(result.criteriaMissed.sort()).toEqual(["c-quad", "c-units"]);
    expect([...result.criteriaMet, ...result.criteriaMissed].sort()).toEqual(
      ["c-quad", "c-react", "c-units"],
    );
  });

  it("drops criterion ids that are not in the scheme", () => {
    const result = normaliseExtraction(
      raw({ criteria_met: ["c-react", "c-invented"] }),
      ANSWER,
      CRITERIA,
    );
    expect(result.criteriaMet).toEqual(["c-react"]);
    expect(result.provisionalScore).toBe(2);
  });

  it("keeps an evidence span that appears verbatim in the answer", () => {
    const result = normaliseExtraction(raw(), ANSWER, CRITERIA);
    expect(result.evidenceSpan).toBe("Z = R = 30 ohm");
  });

  it("drops a paraphrased span rather than highlighting text that is not there", () => {
    const result = normaliseExtraction(
      raw({ evidence_span: "the student said impedance was resistance" }),
      ANSWER,
      CRITERIA,
    );
    expect(result.evidenceSpan).toBeNull();
  });

  it("clamps confidence into 0..1 and treats a non-number as no confidence", () => {
    expect(normaliseExtraction(raw({ confidence: 1.7 }), ANSWER, CRITERIA).confidence).toBe(1);
    expect(normaliseExtraction(raw({ confidence: -2 }), ANSWER, CRITERIA).confidence).toBe(0);
    expect(
      normaliseExtraction(
        raw({ confidence: Number.NaN }),
        ANSWER,
        CRITERIA,
      ).confidence,
    ).toBe(0);
  });

  it("clears the signature and span for a correct answer", () => {
    const result = normaliseExtraction(
      raw({
        is_correct: true,
        error_signature: "",
        criteria_met: ["c-react", "c-quad", "c-units"],
      }),
      ANSWER,
      CRITERIA,
    );
    expect(result.errorSignature).toBeNull();
    expect(result.evidenceSpan).toBeNull();
    expect(result.provisionalScore).toBe(6);
  });

  it("requires review when a supposedly correct answer also has a false belief", () => {
    const result = normaliseExtraction(
      raw({ is_correct: true, criteria_met: ["c-react", "c-quad", "c-units"] }),
      ANSWER,
      CRITERIA,
    );

    expect(result.isCorrect).toBe(false);
    expect(result.confidence).toBeLessThan(0.7);
  });

  it("requires review when is_correct contradicts awarded criteria", () => {
    const result = normaliseExtraction(
      raw({ is_correct: true, criteria_met: ["c-react"], confidence: 0.99 }),
      ANSWER,
      CRITERIA,
    );

    expect(result.isCorrect).toBe(false);
    expect(result.confidence).toBeLessThan(0.7);
  });

  it("requires review when full criteria contradict an incorrect verdict", () => {
    const result = normaliseExtraction(
      raw({
        is_correct: false,
        criteria_met: ["c-react", "c-quad", "c-units"],
        confidence: 0.99,
      }),
      ANSWER,
      CRITERIA,
    );

    expect(result.isCorrect).toBe(false);
    expect(result.confidence).toBeLessThan(0.7);
  });

  it("rejects a signature that is not a specific belief", () => {
    const result = normaliseExtraction(
      raw({ error_signature: "used the wrong formula", confidence: 0.9 }),
      ANSWER,
      CRITERIA,
    );

    expect(result.errorSignature).toBeNull();
    expect(result.confidence).toBeLessThan(0.7);
  });

  it("treats an empty signature as undiagnosed rather than as a belief", () => {
    const result = normaliseExtraction(
      raw({ error_signature: "   " }),
      ANSWER,
      CRITERIA,
    );
    expect(result.errorSignature).toBeNull();
  });

  it("survives missing arrays instead of throwing on a partial response", () => {
    const result = normaliseExtraction(
      raw({
        criteria_met: undefined as unknown as string[],
        criteria_missed: undefined as unknown as string[],
      }),
      ANSWER,
      CRITERIA,
    );
    expect(result.criteriaMet).toEqual([]);
    expect(result.criteriaMissed).toHaveLength(3);
    expect(result.provisionalScore).toBe(0);
  });
});
