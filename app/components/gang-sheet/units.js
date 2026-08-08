// Logical unit system for the gang sheet editor: all item/sheet geometry is
// tracked in inches and only converted to px when talking to Fabric/the DOM.
// This keeps geometry independent of Fabric's view-only canvas.setZoom().
export const PX_PER_IN = 96;

// Standard DTF transfer roll width; sheet length is user-selectable.
export const SHEET_WIDTH_IN = 22;

export function inToPx(inches, pxPerIn = PX_PER_IN) {
  return inches * pxPerIn;
}

export function pxToIn(px, pxPerIn = PX_PER_IN) {
  return px / pxPerIn;
}

export function ftToIn(feet) {
  return feet * 12;
}
