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

export function canRenderBubbleMap(count: number) {
  return count > 0 && count <= MAX_BUBBLES;
}

export function placeBubbles(
  items: BubbleDatum[],
  width: number,
  height: number,
): BubblePlacement[] {
  if (items.length === 0) return [];
  const columns = Math.ceil(Math.sqrt((items.length * width) / height));
  const rows = Math.ceil(items.length / columns);
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const maxRadius = Math.max(12, (Math.min(cellWidth, cellHeight) - 16) / 2);
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
      cy: cellHeight * (row + 0.5),
      radius: minRadius + (maxRadius - minRadius) * scale,
    };
  });
}
