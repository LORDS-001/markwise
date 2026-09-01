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
});
