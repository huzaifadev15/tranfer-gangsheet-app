import { PX_PER_IN } from "./units";

const PT_PER_IN = 72;

// Renders a single line of text to a canvas data URL sized in inches, so it
// slots into the same item shape as uploaded images for Names & Numbers.
export function renderTextTile(text, options = {}) {
  const {
    fontFamily = "Arial, sans-serif",
    fontSizePt = 48,
    color = "#111111",
    paddingIn = 0.15,
  } = options;

  const measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  const fontSizePx = (fontSizePt / PT_PER_IN) * PX_PER_IN;

  ctx.font = `700 ${fontSizePx}px ${fontFamily}`;
  const metrics = ctx.measureText(text);
  const textWidthPx = Math.max(1, Math.ceil(metrics.width));
  const ascent = metrics.actualBoundingBoxAscent ?? fontSizePx * 0.8;
  const descent = metrics.actualBoundingBoxDescent ?? fontSizePx * 0.2;
  const textHeightPx = Math.max(1, Math.ceil(ascent + descent));

  const paddingPx = paddingIn * PX_PER_IN;
  const canvas = document.createElement("canvas");
  canvas.width = textWidthPx + paddingPx * 2;
  canvas.height = textHeightPx + paddingPx * 2;

  const drawCtx = canvas.getContext("2d");
  drawCtx.font = `700 ${fontSizePx}px ${fontFamily}`;
  drawCtx.fillStyle = color;
  drawCtx.textBaseline = "alphabetic";
  drawCtx.fillText(text, paddingPx, paddingPx + ascent);

  return {
    dataUrl: canvas.toDataURL("image/png"),
    widthIn: canvas.width / PX_PER_IN,
    heightIn: canvas.height / PX_PER_IN,
  };
}

// Splits a bulk roster textarea value into individual non-empty lines.
export function parseRoster(rawText) {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
