const DEFAULT_GAP_IN = 0.25;

// Shelf/first-fit-decreasing-height packer. Shared by Auto Build (freshly
// uploaded items), Tidy Canvas (re-pack whatever's already placed), and
// Names & Numbers (generated text tiles) — one packer, three call sites.
//
// `gapIn` is the space between neighbouring designs; `marginIn` is the inset
// kept clear at the sheet edges. They're separate because trimming tolerance
// at the roll edge is a different constraint from spacing between designs.
//
// `keepOrder` places items in the order given instead of tallest-first. It
// costs sheet length, but keeps a roster readable — Names & Numbers uses it
// so a printed sheet still reads top-to-bottom in the order it was entered.
export function packShelf(items, sheetWidthIn, options = {}) {
  const gap = options.gapIn ?? DEFAULT_GAP_IN;
  const margin = options.marginIn ?? gap;
  const usableWidth = Math.max(0.1, sheetWidthIn - margin * 2);
  const sorted = options.keepOrder
    ? [...items]
    : [...items].sort((a, b) => b.heightIn - a.heightIn);

  const placements = [];
  let cursorX = margin;
  let cursorY = margin;
  let rowHeight = 0;

  for (const item of sorted) {
    const width = Math.min(item.widthIn, usableWidth);
    const height = item.heightIn;

    if (cursorX + width > margin + usableWidth && cursorX > margin) {
      cursorX = margin;
      cursorY += rowHeight + gap;
      rowHeight = 0;
    }

    placements.push({ id: item.id, xIn: cursorX, yIn: cursorY });
    cursorX += width + gap;
    rowHeight = Math.max(rowHeight, height);
  }

  const usedHeightIn = placements.length === 0 ? 0 : cursorY + rowHeight + margin;
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
