export type BubbleDatum = {
  id: string;
  weight: number;
  /**
   * Position in embedding space, projected onto the unit square. When every
   * bubble has one, the map places related misconceptions near each other
   * (PRD §7.4) instead of on a grid. Absent for a run with nothing to project
   * from — the seeded demo, or a single cluster — which falls back to the grid.
   */
  x?: number;
  y?: number;
};

export type BubblePlacement = {
  id: string;
  cx: number;
  cy: number;
  radius: number;
};

export const MAX_BUBBLES = 12;

const RANK_LABEL_CLEARANCE = 24;
const CELL_GAP = 16;

export function canRenderBubbleMap(count: number) {
  return count > 0 && count <= MAX_BUBBLES;
}

/** Returns no placements when the canvas dimensions are non-finite or non-positive. */
export function placeBubbles(
  items: BubbleDatum[],
  width: number,
  height: number,
): BubblePlacement[] {
  if (
    items.length === 0 ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return [];
  }

  const topClearance = Math.min(RANK_LABEL_CLEARANCE, height / 2);
  const usableHeight = height - topClearance;
  const columns = Math.min(
    items.length,
    Math.max(1, Math.ceil(Math.sqrt((items.length * width) / usableHeight))),
  );
  const rows = Math.ceil(items.length / columns);
  const cellWidth = width / columns;
  const cellHeight = usableHeight / rows;
  const cellSize = Math.min(cellWidth, cellHeight);
  const gap = Math.min(CELL_GAP, cellSize / 2);
  const maxRadius = (cellSize - gap) / 2;
  const minWeight = Math.min(...items.map((item) => item.weight));
  const maxWeight = Math.max(...items.map((item) => item.weight));
  const range = Math.max(1, maxWeight - minWeight);
  const minRadius = Math.min(24, maxRadius);

  const radiusOf = (item: BubbleDatum) =>
    minRadius + (maxRadius - minRadius) * ((item.weight - minWeight) / range);

  // Embedding-space placement only when every bubble has a position; a mix of
  // meaningful and arbitrary coordinates would be worse than an honest grid.
  const positioned = items.every(
    (item) => Number.isFinite(item.x) && Number.isFinite(item.y),
  );

  if (positioned) {
    return relax(
      items.map((item) => ({
        id: item.id,
        // Inset by the radius so a bubble at the edge of the projection is
        // still drawn whole rather than clipped by the canvas.
        cx: pad(item.x!, radiusOf(item), width),
        cy: topClearance + pad(item.y!, radiusOf(item), usableHeight),
        radius: radiusOf(item),
      })),
      width,
      height,
      topClearance,
    );
  }

  return items.map((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      id: item.id,
      cx: cellWidth * (column + 0.5),
      cy: topClearance + cellHeight * (row + 0.5),
      radius: radiusOf(item),
    };
  });
}

/** Maps a 0..1 coordinate into an axis, leaving room for the bubble itself. */
function pad(value: number, radius: number, extent: number): number {
  const usable = Math.max(0, extent - radius * 2);
  return radius + Math.min(1, Math.max(0, value)) * usable;
}

/**
 * Pushes overlapping bubbles apart while keeping them near where the
 * projection put them.
 *
 * The projection says which misconceptions are related; it says nothing about
 * how big each one is. Two closely related clusters holding half the class
 * each would be drawn as two large circles on top of one another, hiding the
 * evidence the map exists to show. A few relaxation passes separate them by
 * the least amount that makes both readable.
 */
function relax(
  placements: BubblePlacement[],
  width: number,
  height: number,
  topClearance: number,
): BubblePlacement[] {
  const GAP = 6;
  const PASSES = 60;
  const points = placements.map((p) => ({ ...p }));

  for (let pass = 0; pass < PASSES; pass += 1) {
    let moved = false;

    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i];
        const b = points[j];
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const wanted = a.radius + b.radius + GAP;
        let apart = Math.hypot(dx, dy);

        if (apart >= wanted) continue;

        // Exactly coincident: nudge along a fixed axis rather than dividing by
        // zero, and let later passes resolve it properly.
        const ux = apart < 1e-6 ? 1 : dx / apart;
        const uy = apart < 1e-6 ? 0 : dy / apart;
        if (apart < 1e-6) apart = 0;

        const shift = (wanted - apart) / 2;
        a.cx -= ux * shift;
        a.cy -= uy * shift;
        b.cx += ux * shift;
        b.cy += uy * shift;
        moved = true;
      }
    }

    for (const p of points) {
      p.cx = Math.min(width - p.radius, Math.max(p.radius, p.cx));
      p.cy = Math.min(
        height - p.radius,
        Math.max(topClearance + p.radius, p.cy),
      );
    }

    if (!moved) break;
  }

  return points;
}
