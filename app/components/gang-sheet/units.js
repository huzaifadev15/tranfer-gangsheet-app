// Logical unit system for the gang sheet editor: all item/sheet geometry is
// tracked in inches and only converted to px when talking to Fabric/the DOM.
// This keeps geometry independent of Fabric's view-only canvas.setZoom().
export const PX_PER_IN = 96;

// Print resolution assumed for uploaded artwork. A 600x400px file is treated
// as 2" x 1.33" at press, which is the print-industry standard for DTF and
// what customers expect when they drop in a 300dpi design.
export const SOURCE_DPI = 300;

// Standard DTF transfer roll width; sheet length is user-selectable.
export const SHEET_WIDTH_IN = 22;

// Physical size of source artwork, from its pixel dimensions.
export function sourcePxToIn(px, dpi = SOURCE_DPI) {
  return px / dpi;
}

export function inToPx(inches, pxPerIn = PX_PER_IN) {
  return inches * pxPerIn;
}

export function pxToIn(px, pxPerIn = PX_PER_IN) {
  return px / pxPerIn;
}

export function ftToIn(feet) {
  return feet * 12;
}
