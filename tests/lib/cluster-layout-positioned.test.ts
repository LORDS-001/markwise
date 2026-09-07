import { describe, expect, it } from "vitest";
import { placeBubbles, type BubbleDatum } from "@/lib/cluster-layout";

/**
 * Embedding-space placement — PRD §7.4.
 *
 * Positions only mean something if two things hold: related clusters really do
 * land near each other, and no bubble is hidden underneath another. The second
 * matters as much as the first, because the map exists to show the evidence.
 */

const WIDTH = 600;
const HEIGHT = 400;

const gap = (
  a: { cx: number; cy: number; radius: number },
  b: { cx: number; cy: number; radius: number },
) => Math.hypot(a.cx - b.cx, a.cy - b.cy) - (a.radius + b.radius);

describe("placeBubbles with projected positions", () => {
  it("keeps clusters that are near in embedding space near on screen", () => {
    const items: BubbleDatum[] = [
      { id: "a", weight: 5, x: 0.1, y: 0.1 },
      { id: "b", weight: 5, x: 0.15, y: 0.15 },
      { id: "c", weight: 5, x: 0.9, y: 0.9 },
    ];
    const [a, b, c] = placeBubbles(items, WIDTH, HEIGHT);

    const near = Math.hypot(a.cx - b.cx, a.cy - b.cy);
    const far = Math.hypot(a.cx - c.cx, a.cy - c.cy);
    expect(near).toBeLessThan(far);
  });

  it("never leaves two bubbles overlapping", () => {
    // Four large clusters projected almost on top of each other: without
    // separation the map would render one circle hiding three.
    const items: BubbleDatum[] = [
      { id: "a", weight: 20, x: 0.5, y: 0.5 },
      { id: "b", weight: 20, x: 0.51, y: 0.5 },
      { id: "c", weight: 20, x: 0.5, y: 0.51 },
      { id: "d", weight: 20, x: 0.49, y: 0.49 },
    ];
    const placements = placeBubbles(items, WIDTH, HEIGHT);

    for (let i = 0; i < placements.length; i += 1) {
      for (let j = i + 1; j < placements.length; j += 1) {
        expect(
          gap(placements[i], placements[j]),
          `${placements[i].id} overlaps ${placements[j].id}`,
        ).toBeGreaterThanOrEqual(-0.5);
      }
    }
  });

  it("separates bubbles projected to exactly the same point", () => {
    const items: BubbleDatum[] = [
      { id: "a", weight: 8, x: 0.5, y: 0.5 },
      { id: "b", weight: 8, x: 0.5, y: 0.5 },
    ];
    const [a, b] = placeBubbles(items, WIDTH, HEIGHT);

    expect(Number.isFinite(a.cx)).toBe(true);
    expect(Number.isFinite(b.cx)).toBe(true);
    expect(gap(a, b)).toBeGreaterThanOrEqual(-0.5);
  });

  it("keeps every bubble fully inside the canvas", () => {
    const items: BubbleDatum[] = [
      { id: "a", weight: 30, x: 0, y: 0 },
      { id: "b", weight: 30, x: 1, y: 1 },
      { id: "c", weight: 30, x: 1, y: 0 },
    ];

    for (const p of placeBubbles(items, WIDTH, HEIGHT)) {
      expect(p.cx - p.radius).toBeGreaterThanOrEqual(-0.5);
      expect(p.cx + p.radius).toBeLessThanOrEqual(WIDTH + 0.5);
      expect(p.cy - p.radius).toBeGreaterThanOrEqual(-0.5);
      expect(p.cy + p.radius).toBeLessThanOrEqual(HEIGHT + 0.5);
    }
  });

  it("still sizes bubbles by how many students are affected", () => {
    const [small, large] = placeBubbles(
      [
        { id: "small", weight: 2, x: 0.2, y: 0.5 },
        { id: "large", weight: 30, x: 0.8, y: 0.5 },
      ],
      WIDTH,
      HEIGHT,
    );
    expect(large.radius).toBeGreaterThan(small.radius);
  });

  it("falls back to the grid when only some clusters have a position", () => {
    // A mix of meaningful and arbitrary coordinates would read as though every
    // position meant something. An honest grid is better.
    const mixed = placeBubbles(
      [
        { id: "a", weight: 5, x: 0.1, y: 0.1 },
        { id: "b", weight: 5 },
      ],
      WIDTH,
      HEIGHT,
    );
    const grid = placeBubbles(
      [
        { id: "a", weight: 5 },
        { id: "b", weight: 5 },
      ],
      WIDTH,
      HEIGHT,
    );
    expect(mixed).toEqual(grid);
  });

  it("is deterministic for the same input", () => {
    const items: BubbleDatum[] = [
      { id: "a", weight: 7, x: 0.2, y: 0.3 },
      { id: "b", weight: 4, x: 0.7, y: 0.8 },
      { id: "c", weight: 9, x: 0.4, y: 0.6 },
    ];
    expect(placeBubbles(items, WIDTH, HEIGHT)).toEqual(
      placeBubbles(items, WIDTH, HEIGHT),
    );
  });
});
