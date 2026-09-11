// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  beliefRate,
  judgeSignatureShape,
} from "@/lib/pipeline/signature-quality";

/**
 * PRD §11's fatal risk, held in place.
 *
 * The fixtures are lifted verbatim from the extraction prompt's own GOOD and
 * BAD lists. That is the point: if someone softens the instruction, or this
 * judge drifts away from it, one of these fails and names the disagreement
 * instead of letting the two quietly diverge.
 */

const GOOD = [
  "believes impedance and resistance are interchangeable quantities",
  "believes reactance does not contribute to the opposition that limits current",
  "believes inductance is measured in millihenries by default",
  "believes the phase angle is measured between current and resistance",
];

const BAD = [
  "used the wrong formula",
  "did not show working",
  "made a calculation error",
  "forgot to include reactance",
  "answer is incomplete",
  "misunderstood the question",
];

describe("the belief test from PRD §11", () => {
  it.each(GOOD)("accepts a stated belief: %s", (signature) => {
    expect(judgeSignatureShape(signature)).toEqual({ ok: true, reason: null });
  });

  it.each(BAD)("rejects a description of the answer: %s", (signature) => {
    const verdict = judgeSignatureShape(signature);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBeTruthy();
  });

  it("rejects a description wearing the believes prefix", () => {
    // The failure that survives a prefix check: it is shaped like a belief and
    // still says only that the student got it wrong, so it clusters with
    // nothing. This is the case the runtime regex cannot catch.
    for (const signature of [
      "believes the wrong formula applies here",
      "believes they did not need to include reactance",
      "believes the answer is incomplete",
      "believes they misunderstood the question",
      "believes they should have used impedance",
    ]) {
      expect(judgeSignatureShape(signature).ok).toBe(false);
    }
  });

  it("rejects a signature that refers to the answer rather than the world", () => {
    expect(judgeSignatureShape("believes the answer only needed one step").ok).toBe(
      false,
    );
  });

  it("rejects a belief too short to be argued with", () => {
    expect(judgeSignatureShape("believes impedance").ok).toBe(false);
  });

  it("rejects an empty or oversized signature", () => {
    expect(judgeSignatureShape("   ").ok).toBe(false);
    expect(judgeSignatureShape(`believes ${"x".repeat(600)}`).ok).toBe(false);
  });
});

describe("beliefRate", () => {
  it("reports the share that name a belief", () => {
    expect(beliefRate([...GOOD, ...BAD])).toBeCloseTo(
      GOOD.length / (GOOD.length + BAD.length),
    );
  });

  it("treats a class with nothing to diagnose as unfailed", () => {
    // No signatures is not the same as bad signatures, and reporting 0% for a
    // class that simply made no shared errors would read as a broken run.
    expect(beliefRate([])).toBe(1);
  });
});
