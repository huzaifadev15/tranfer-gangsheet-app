const DEFAULT_GAP_IN = 0.25;

// Shelf/first-fit-decreasing-height packer. Shared by Auto Build (freshly
// uploaded items), Tidy Canvas (re-pack whatever's already placed), and
// Names & Numbers (generated text tiles) — one packer, three call sites.
export function packShelf(items, sheetWidthIn, options = {}) {
  const gap = options.gapIn ?? DEFAULT_GAP_IN;
  const sorted = [...items].sort((a, b) => b.heightIn - a.heightIn);

  const placements = [];
  let cursorX = gap;
  let cursorY = gap;
  let rowHeight = 0;

  for (const item of sorted) {
    const width = Math.min(item.widthIn, sheetWidthIn - gap * 2);
    const height = item.heightIn;

    if (cursorX + width + gap > sheetWidthIn && cursorX > gap) {
      cursorX = gap;
      cursorY += rowHeight + gap;
      rowHeight = 0;
    }

    placements.push({ id: item.id, xIn: cursorX, yIn: cursorY });
    cursorX += width + gap;
    rowHeight = Math.max(rowHeight, height);
  }

  const usedHeightIn = cursorY + rowHeight + gap;
  return { placements, usedHeightIn };
}

export function coveragePercent(items, sheetWidthIn, sheetHeightIn) {
  if (!sheetWidthIn || !sheetHeightIn) return 0;
  const coveredIn2 = items.reduce(
    (sum, item) => sum + item.widthIn * item.heightIn,
    0,
  );
  const sheetIn2 = sheetWidthIn * sheetHeightIn;
  return Math.min(100, Math.round((coveredIn2 / sheetIn2) * 1000) / 10);
}
