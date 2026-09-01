import { describe, expect, it } from "vitest";
import {
  MAX_BUBBLES,
  canRenderBubbleMap,
  placeBubbles,
} from "@/lib/cluster-layout";

describe("cluster bubble layout", () => {
  it.each([0, 1, 4, 8, 12])(
    "places %i clusters at unique, non-overlapping, bounded points",
    (count) => {
      const items = Array.from({ length: count }, (_, index) => ({
        id: "cluster-" + index,
        weight: index + 1,
      }));
      const placed = placeBubbles(items, 760, 380);
      expect(placed).toHaveLength(items.length);
      expect(new Set(placed.map((item) => item.cx + ":" + item.cy)).size).toBe(
        items.length,
      );

      for (const item of placed) {
        expect(item.cx - item.radius).toBeGreaterThanOrEqual(0);
        expect(item.cx + item.radius).toBeLessThanOrEqual(760);
        expect(item.cy - item.radius).toBeGreaterThanOrEqual(0);
        expect(item.cy + item.radius).toBeLessThanOrEqual(380);
      }

      for (let left = 0; left < placed.length; left += 1) {
        for (let right = left + 1; right < placed.length; right += 1) {
          const dx = placed[left].cx - placed[right].cx;
          const dy = placed[left].cy - placed[right].cy;
          const distance = Math.sqrt(dx * dx + dy * dy);
          expect(distance).toBeGreaterThanOrEqual(
            placed[left].radius + placed[right].radius,
          );
        }
      }
    },
  );

  it("uses the ranked-list fallback above the readable map limit", () => {
    expect(canRenderBubbleMap(MAX_BUBBLES)).toBe(true);
    expect(canRenderBubbleMap(MAX_BUBBLES + 1)).toBe(false);
  });

  it("keeps a dense small-canvas layout finite, bounded, and non-overlapping", () => {
    const placed = placeBubbles(
      Array.from({ length: 4 }, (_, index) => ({
        id: "small-" + index,
        weight: index + 1,
      })),
      40,
      40,
    );

    expect(placed).toHaveLength(4);
    for (const item of placed) {
      expect([item.cx, item.cy, item.radius].every(Number.isFinite)).toBe(true);
      expect(item.cx - item.radius).toBeGreaterThanOrEqual(0);
      expect(item.cx + item.radius).toBeLessThanOrEqual(40);
      expect(item.cy - item.radius).toBeGreaterThanOrEqual(0);
      expect(item.cy + item.radius).toBeLessThanOrEqual(40);
    }

    for (let left = 0; left < placed.length; left += 1) {
      for (let right = left + 1; right < placed.length; right += 1) {
        const dx = placed[left].cx - placed[right].cx;
        const dy = placed[left].cy - placed[right].cy;
        expect(Math.sqrt(dx * dx + dy * dy)).toBeGreaterThanOrEqual(
          placed[left].radius + placed[right].radius,
        );
      }
    }
  });

  it.each([
    [0, 40],
    [-1, 40],
    [Number.NaN, 40],
    [Number.POSITIVE_INFINITY, 40],
    [40, 0],
    [40, -1],
    [40, Number.NaN],
    [40, Number.POSITIVE_INFINITY],
  ])("returns no placements for an invalid %s by %s canvas", (width, height) => {
    expect(placeBubbles([{ id: "cluster", weight: 1 }], width, height)).toEqual([]);
  });

  it.each([1, 8, 12])("reserves top clearance for %i map rank labels", (count) => {
    const placed = placeBubbles(
      Array.from({ length: count }, (_, index) => ({
        id: "label-" + index,
        weight: count - index,
      })),
      1000,
      420,
    );

    expect(
      Math.min(...placed.map((item) => item.cy - item.radius)),
    ).toBeGreaterThanOrEqual(24);
  });
});
