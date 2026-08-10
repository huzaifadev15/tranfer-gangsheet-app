const PT_PER_IN = 72;

// Text tiles are rasterised at print resolution rather than the editor's
// 96 px/in, so a 6" jersey number still has clean edges on the press.
export const TILE_DPI = 150;

// Keyline width as a fraction of the font size, sized to read like the
// contrast outline stitched around jersey twill.
const OUTLINE_RATIO = 0.08;

// Fonts offered in Names & Numbers. Tiles are rasterised in the browser, so
// only families that ship with the OS are listed — a missing webfont would
// silently fall back and print as the wrong typeface.
export const TEXT_FONTS = [
  {
    id: "collegiate",
    label: "Collegiate",
    stack: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
    weight: 400,
  },
  {
    id: "varsity",
    label: "Varsity Block",
    stack: "'Arial Black', 'Arial Bold', Gadget, sans-serif",
    weight: 900,
  },
  {
    id: "condensed",
    label: "Athletic Condensed",
    stack: "'Arial Narrow', 'Helvetica Neue Condensed', 'Liberation Sans Narrow', sans-serif",
    weight: 700,
  },
  {
    id: "serif",
    label: "Classic Serif",
    stack: "Georgia, 'Times New Roman', serif",
    weight: 700,
  },
  {
    id: "sans",
    label: "Modern Sans",
    stack: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    weight: 700,
  },
  {
    id: "script",
    label: "Script",
    stack: "'Brush Script MT', 'Segoe Script', 'Bradley Hand', cursive",
    weight: 400,
  },
];

export const DEFAULT_FONT_ID = TEXT_FONTS[0].id;

export function getTextFont(fontId) {
  return TEXT_FONTS.find((font) => font.id === fontId) ?? TEXT_FONTS[0];
}

let measureCtx = null;
function getMeasureCtx() {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  return measureCtx;
}

// Ink box of a single line: what the glyphs actually cover, not the em box.
// Sizing on the em box would make a "1 inch" name shorter than an inch.
function inkBox(ctx, text, sizePx) {
  const m = ctx.measureText(text);
  const ascent = m.actualBoundingBoxAscent ?? sizePx * 0.8;
  const descent = m.actualBoundingBoxDescent ?? sizePx * 0.2;
  const left = m.actualBoundingBoxLeft ?? 0;
  const right = m.actualBoundingBoxRight ?? m.width;
  return {
    ascent,
    descent,
    left,
    right,
    width: Math.max(1, left + right),
    height: Math.max(1, ascent + descent),
  };
}

// Shared geometry for measure and render so a tile's placeholder dimensions
// always match the bitmap that eventually replaces them.
function layoutTile(text, options = {}) {
  const {
    fontId,
    heightIn,
    fontSizePt,
    outline = false,
    paddingIn = 0,
    dpi = TILE_DPI,
  } = options;

  const font = getTextFont(fontId);
  const ctx = getMeasureCtx();

  // Measure once at a reference size, then scale the font so the ink box
  // lands on the requested physical height.
  const REF_PX = 200;
  ctx.font = `${font.weight} ${REF_PX}px ${font.stack}`;
  const ref = inkBox(ctx, text, REF_PX);

  const fontPx =
    heightIn > 0
      ? (REF_PX * heightIn * dpi) / ref.height
      : ((fontSizePt || 48) / PT_PER_IN) * dpi;

  ctx.font = `${font.weight} ${fontPx}px ${font.stack}`;
  const box = inkBox(ctx, text, fontPx);

  // Half the stroke sits outside the glyph, so the tile has to grow by that
  // much or the outline gets clipped at the edges.
  const strokePx = outline ? fontPx * OUTLINE_RATIO : 0;
  const padPx = paddingIn * dpi + strokePx / 2;

  return {
    font,
    fontPx,
    strokePx,
    dpi,
    canvasW: Math.max(1, Math.ceil(box.width + padPx * 2)),
    canvasH: Math.max(1, Math.ceil(box.height + padPx * 2)),
    drawX: padPx + box.left,
    baselineY: padPx + box.ascent,
  };
}

// Physical size a tile will occupy, without paying for the raster. Lets the
// modal pack a whole roster live while the customer is still typing.
export function measureTextTile(text, options = {}) {
  const { canvasW, canvasH, dpi } = layoutTile(text, options);
  return { widthIn: canvasW / dpi, heightIn: canvasH / dpi };
}

// Renders a single line of text to a canvas data URL sized in inches, so it
// slots into the same item shape as uploaded images for Names & Numbers.
export function renderTextTile(text, options = {}) {
  const { color = "#111111", outline = false, outlineColor = "#ffffff" } = options;
  const layout = layoutTile(text, options);

  const canvas = document.createElement("canvas");
  canvas.width = layout.canvasW;
  canvas.height = layout.canvasH;

  const ctx = canvas.getContext("2d");
  ctx.font = `${layout.font.weight} ${layout.fontPx}px ${layout.font.stack}`;
  ctx.textBaseline = "alphabetic";

  if (outline && layout.strokePx > 0) {
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.lineWidth = layout.strokePx;
    ctx.strokeStyle = outlineColor;
    ctx.strokeText(text, layout.drawX, layout.baselineY);
  }

  ctx.fillStyle = color;
  ctx.fillText(text, layout.drawX, layout.baselineY);

  return {
    dataUrl: canvas.toDataURL("image/png"),
    widthIn: canvas.width / layout.dpi,
    heightIn: canvas.height / layout.dpi,
    widthPx: canvas.width,
    heightPx: canvas.height,
  };
}
