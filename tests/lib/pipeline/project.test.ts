import { describe, expect, it } from "vitest";
import { centroid, projectToPlane } from "@/lib/pipeline/project";

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe("centroid", () => {
  it("averages each dimension", () => {
    expect(centroid([[0, 0], [2, 4]])).toEqual([1, 2]);
  });

  it("returns nothing for no vectors", () => {
    expect(centroid([])).toEqual([]);
  });

  it("returns the vector itself for a single member", () => {
    expect(centroid([[1, 2, 3]])).toEqual([1, 2, 3]);
  });
});

describe("projectToPlane", () => {
  it("returns nothing for no centroids", () => {
    expect(projectToPlane([])).toEqual([]);
  });

  it("centres a lone cluster", () => {
    expect(projectToPlane([[1, 0]])).toEqual([{ x: 0.5, y: 0.5 }]);
  });

  it("separates two clusters rather than stacking them", () => {
    const points = projectToPlane([
      [1, 0],
      [0, 1],
    ]);
    expect(points).toHaveLength(2);
    expect(distance(points[0], points[1])).toBeGreaterThan(0.3);
  });

  it("keeps every point inside the unit square", () => {
    const points = projectToPlane([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 0],
    ]);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });

  it("places related misconceptions nearer than unrelated ones", () => {
    // This is the property PRD §7.4 actually asks for. Two near-identical
    // centroids and one far away: the near pair must end up closer on the
    // plane than either is to the outlier, or the positions mean nothing.
    const points = projectToPlane([
      [1, 0, 0],
      [0.98, 0.02, 0],
      [0, 0, 1],
    ]);

    const near = distance(points[0], points[1]);
    expect(near).toBeLessThan(distance(points[0], points[2]));
    expect(near).toBeLessThan(distance(points[1], points[2]));
  });

  it("preserves the ordering of distances across a larger set", () => {
    const points = projectToPlane([
      [1, 0, 0, 0],
      [0.95, 0.05, 0, 0],
      [0, 1, 0, 0],
      [0, 0.95, 0.05, 0],
      [0, 0, 0, 1],
    ]);

    // Each tight pair must be closer to its partner than to anything else.
    expect(distance(points[0], points[1])).toBeLessThan(distance(points[0], points[2]));
    expect(distance(points[2], points[3])).toBeLessThan(distance(points[2], points[0]));
  });

  it("is deterministic, so a map does not reshuffle between visits", () => {
    const vectors = [
      [1, 0, 0],
      [0, 1, 0],
      [0.5, 0.5, 0],
      [0, 0, 1],
    ];
    expect(projectToPlane(vectors)).toEqual(projectToPlane(vectors));
  });

  it("spreads identical centroids instead of hiding them behind one another", () => {
    const points = projectToPlane([
      [1, 0],
      [1, 0],
      [1, 0],
    ]);
    expect(distance(points[0], points[1])).toBeGreaterThan(0.1);
    expect(distance(points[1], points[2])).toBeGreaterThan(0.1);
  });

  it("produces a finite coordinate for every centroid", () => {
    const points = projectToPlane([
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ]);
    for (const p of points) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});
