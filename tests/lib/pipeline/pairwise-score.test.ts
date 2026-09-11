// @vitest-environment node

import { describe, expect, it } from "vitest";
import { pairwiseScore } from "@/lib/pipeline/tuning";

/**
 * The metric behind both the threshold sweep and the extraction measurement.
 *
 * It decides which DISTANCE_THRESHOLD ships, so a quiet error here does not
 * announce itself — it just moves the constant and everything downstream
 * inherits the move.
 */

describe("pairwiseScore", () => {
  it("scores a perfect grouping", () => {
    const truth = ["cl-1", "cl-1", "cl-2", "cl-2"];
    expect(pairwiseScore([[0, 1], [2, 3]], truth)).toEqual({
      precision: 1,
      recall: 1,
      f1: 1,
    });
  });

  it("penalises merging two real clusters", () => {
    const truth = ["cl-1", "cl-1", "cl-2", "cl-2"];
    const { precision, recall } = pairwiseScore([[0, 1, 2, 3]], truth);
    // All four real pairs caught, but four wrong pairs invented alongside them.
    expect(recall).toBe(1);
    expect(precision).toBeCloseTo(2 / 6);
  });

  it("penalises splitting one real cluster", () => {
    const truth = ["cl-1", "cl-1", "cl-1", "cl-1"];
    const { precision, recall } = pairwiseScore([[0, 1], [2, 3]], truth);
    expect(precision).toBe(1);
    expect(recall).toBeCloseTo(2 / 6);
  });

  it("does not count the one-off bucket as a shared belief", () => {
    // Answers that grouped with nothing do not share a cause, so pairs inside
    // cl-other are neither owed to recall nor charged to precision.
    const truth = ["cl-other", "cl-other", "cl-1", "cl-1"];
    expect(pairwiseScore([[2, 3]], truth)).toEqual({
      precision: 1,
      recall: 1,
      f1: 1,
    });
  });

  it("treats answers left out of every cluster as ungrouped, not as one cluster", () => {
    // The subtle one. Unassigned answers all carry the same sentinel, so
    // comparing assignments directly makes every singleton "together" with
    // every other singleton — a phantom cluster that charges precision for
    // pairs the threshold never actually merged, punishing exactly the
    // conservative thresholds that leave answers alone.
    const truth = ["cl-1", "cl-1", "cl-2", "cl-3"];
    expect(pairwiseScore([[0, 1]], truth)).toEqual({
      precision: 1,
      recall: 1,
      f1: 1,
    });
  });

  it("reports zero rather than dividing by zero on an empty grouping", () => {
    expect(pairwiseScore([], ["cl-1", "cl-1"])).toMatchObject({ f1: 0 });
  });
});
