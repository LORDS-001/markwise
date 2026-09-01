export type BubbleDatum = {
  id: string;
  weight: number;
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

  return items.map((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const scale = (item.weight - minWeight) / range;
    const minRadius = Math.min(24, maxRadius);
    return {
      id: item.id,
      cx: cellWidth * (column + 0.5),
      cy: topClearance + cellHeight * (row + 0.5),
      radius: minRadius + (maxRadius - minRadius) * scale,
    };
  });
}
