// Minimum breathing room between designs. Anything closer than this risks
// bleeding into a neighbour when the sheet is cut, so it's flagged the same
// way a true overlap is.
export const MIN_GAP_IN = 0.125;

// Axis-aligned boxes are already rotation-aware here — they come from
// Fabric's getBoundingRect(), which is the rotated hull of each object.
export function findOverlaps(items, minGapIn = MIN_GAP_IN) {
  const flagged = new Map();

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];

      const apart =
        a.boxXIn + a.boxWIn + minGapIn <= b.boxXIn ||
        b.boxXIn + b.boxWIn + minGapIn <= a.boxXIn ||
        a.boxYIn + a.boxHIn + minGapIn <= b.boxYIn ||
        b.boxYIn + b.boxHIn + minGapIn <= a.boxYIn;

      if (!apart) {
        flagged.set(a.id, a.label);
        flagged.set(b.id, b.label);
      }
    }
  }

  return [...flagged].map(([id, label]) => ({ id, label }));
}

// Designs pushed past the printable edge won't survive trimming.
export function findOutOfBounds(items, sheetWidthIn, sheetHeightIn) {
  return items
    .filter(
      (item) =>
        item.boxXIn < 0 ||
        item.boxYIn < 0 ||
        item.boxXIn + item.boxWIn > sheetWidthIn ||
        item.boxYIn + item.boxHIn > sheetHeightIn,
    )
    .map((item) => ({ id: item.id, label: item.label }));
}
