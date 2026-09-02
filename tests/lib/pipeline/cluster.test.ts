import { describe, expect, it } from "vitest";
import {
  agglomerativeCluster,
  cosineDistance,
  DISTANCE_THRESHOLD,
} from "@/lib/pipeline/cluster";

describe("cosineDistance", () => {
  it("is zero for identical direction", () => {
    expect(cosineDistance([1, 0], [1, 0])).toBeCloseTo(0);
    expect(cosineDistance([1, 2, 3], [2, 4, 6])).toBeCloseTo(0);
  });

  it("is one for orthogonal vectors", () => {
    expect(cosineDistance([1, 0], [0, 1])).toBeCloseTo(1);
  });

  it("is two for opposed vectors", () => {
    expect(cosineDistance([1, 0], [-1, 0])).toBeCloseTo(2);
  });

  it("treats a zero vector as maximally distant rather than dividing by zero", () => {
    expect(cosineDistance([0, 0], [1, 1])).toBe(1);
    expect(Number.isNaN(cosineDistance([0, 0], [0, 0]))).toBe(false);
  });

  it("rejects a dimension mismatch instead of silently truncating", () => {
    expect(() => cosineDistance([1, 0], [1, 0, 0])).toThrow(/dimension mismatch/);
  });
});

describe("agglomerativeCluster", () => {
  it("returns nothing for no vectors", () => {
    expect(agglomerativeCluster([], DISTANCE_THRESHOLD)).toEqual([]);
  });

  it("returns a single group for one vector", () => {
    expect(agglomerativeCluster([[1, 0]], DISTANCE_THRESHOLD)).toEqual([[0]]);
  });

  it("groups near-identical vectors and separates distant ones", () => {
    const groups = agglomerativeCluster(
      [
        [1, 0],
        [0.99, 0.01],
        [0, 1],
        [0.01, 0.99],
      ],
      0.1,
    );
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.length).sort()).toEqual([2, 2]);
    // Each pair must be together, whichever order the groups come back in.
    const groupOf = (i: number) => groups.findIndex((g) => g.includes(i));
    expect(groupOf(0)).toBe(groupOf(1));
    expect(groupOf(2)).toBe(groupOf(3));
    expect(groupOf(0)).not.toBe(groupOf(2));
  });

  it("leaves everything separate when the threshold admits no merge", () => {
    const groups = agglomerativeCluster(
      [
        [1, 0],
        [0, 1],
        [-1, 0],
      ],
      0,
    );
    expect(groups).toHaveLength(3);
  });

  it("collapses everything into one group when the threshold admits every merge", () => {
    const groups = agglomerativeCluster(
      [
        [1, 0],
        [0, 1],
        [-1, 0],
      ],
      2,
    );
    expect(groups).toEqual([[0, 1, 2]]);
  });

  it("orders groups largest first with ascending members", () => {
    const groups = agglomerativeCluster(
      [
        [0, 1],
        [1, 0],
        [1, 0.01],
        [0.99, 0],
      ],
      0.05,
    );
    expect(groups[0]).toEqual([1, 2, 3]);
    expect(groups[1]).toEqual([0]);
  });

  it("uses average linkage, not single linkage, so a chain does not merge", () => {
    // Three points spaced just under the threshold apart in sequence. Single
    // linkage would chain all three together; average linkage must not, because
    // the mean distance from the far point to the merged pair exceeds it.
    const angle = (deg: number) => [
      Math.cos((deg * Math.PI) / 180),
      Math.sin((deg * Math.PI) / 180),
    ];
    const groups = agglomerativeCluster([angle(0), angle(24), angle(48)], 0.05);
    expect(groups.some((g) => g.length === 3)).toBe(false);
  });
});
