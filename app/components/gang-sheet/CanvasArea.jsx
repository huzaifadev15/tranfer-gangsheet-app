import { useRef } from "react";
import { PX_PER_IN } from "./units";
import SelectionOverlay from "./SelectionOverlay";
import Icon from "./Icon";

// The vertical ruler needs more room than the horizontal one: on a 40ft sheet
// its labels reach four characters ('480"'), and they're laid out across the
// ruler's width rather than along its length.
const RULER_H_PX = 28;
const RULER_V_PX = 46;
const MIN_LABEL_GAP_PX = 56;
const LABEL_STEPS_IN = [1, 2, 5, 10, 20, 50, 100];

// A 40ft sheet is 480 inches — drawing a labelled tick per inch would be an
// unreadable smear at fit-to-width zoom. Pick the coarsest label interval that
// still fills the ruler, and hang minor ticks off it.
function rulerSteps(pxPerInDisplayed) {
  const labelStepIn =
    LABEL_STEPS_IN.find((step) => step * pxPerInDisplayed >= MIN_LABEL_GAP_PX) ??
    LABEL_STEPS_IN[LABEL_STEPS_IN.length - 1];
  const minorStepIn = labelStepIn / 5;
  const showMinor = minorStepIn * pxPerInDisplayed >= 6;
  return { labelStepIn, minorStepIn, showMinor };
}

function Ticks({ lengthIn, pxPerInDisplayed, orientation }) {
  const { labelStepIn, minorStepIn, showMinor } = rulerSteps(pxPerInDisplayed);
  const step = showMinor ? minorStepIn : labelStepIn;
  const ticks = [];

  for (let value = 0; value <= lengthIn + 1e-6; value += step) {
    const inches = Math.round(value * 1000) / 1000;
    const major = Math.abs(inches % labelStepIn) < 1e-6;
    ticks.push(
      <span
        key={inches}
        className={`gsb-tick${major ? " gsb-tick-major" : ""}`}
        style={
          orientation === "horizontal"
            ? { left: inches * pxPerInDisplayed }
            : { top: inches * pxPerInDisplayed }
        }
      >
        {major ? <em>{inches}&quot;</em> : null}
      </span>,
    );
  }
  return ticks;
}

export default function CanvasArea({
  canvasElRef,
  containerRef,
  sheetWidthIn,
  sheetHeightIn,
  zoomPct,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onZoomFit,
  isEmpty,
  selection,
  onDuplicateSelected,
  onDeleteSelected,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  toolMode = "select",
}) {
  const panRef = useRef(null);
  const pxPerInDisplayed = PX_PER_IN * (zoomPct / 100);
  const contentWidthPx = sheetWidthIn * pxPerInDisplayed;
  const contentHeightPx = sheetHeightIn * pxPerInDisplayed;
  const panning = toolMode === "pan";

  // The sheet lives inside a scrolling viewport, so "pan" means scroll the
  // viewport rather than translate Fabric's viewportTransform — that keeps the
  // rulers, which are plain DOM, locked to the artwork.
  const onPointerDown = (e) => {
    if (!panning) return;
    const el = containerRef.current;
    if (!el) return;
    panRef.current = {
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const start = panRef.current;
    const el = containerRef.current;
    if (!start || !el) return;
    el.scrollLeft = start.left - (e.clientX - start.x);
    el.scrollTop = start.top - (e.clientY - start.y);
  };

  const endPan = (e) => {
    if (!panRef.current) return;
    panRef.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div className="gsb-canvas-area">
      {/* History and zoom float over the canvas rather than occupying a full
          -width strip, so the sheet itself gets the vertical space. */}
      <div className="gsb-float-pill gsb-float-history">
        <button
          type="button"
          className="gsb-pill-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <Icon name="undo" />
        </button>
        <button
          type="button"
          className="gsb-pill-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          <Icon name="redo" />
        </button>
      </div>

      <div className="gsb-float-pill gsb-float-zoom">
        <button
          type="button"
          className="gsb-pill-btn"
          onClick={onZoomOut}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Icon name="zoomOut" />
        </button>
        <button
          type="button"
          className="gsb-pill-readout"
          onClick={onZoomReset}
          title="Reset to 100%"
        >
          {zoomPct}%
        </button>
        <button
          type="button"
          className="gsb-pill-btn"
          onClick={onZoomIn}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <Icon name="zoomIn" />
        </button>
        <span className="gsb-pill-sep" />
        <button
          type="button"
          className="gsb-pill-btn"
          onClick={onZoomFit}
          aria-label="Fit sheet width"
          title="Fit sheet width"
        >
          <Icon name="fit" />
        </button>
      </div>

      <div
        className={`gsb-viewport${panning ? " gsb-viewport-panning" : ""}`}
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        <div
          className="gsb-grid"
          style={{
            width: RULER_V_PX + contentWidthPx,
            height: RULER_H_PX + contentHeightPx,
          }}
        >
          <div className="gsb-corner" style={{ width: RULER_V_PX, height: RULER_H_PX }}>
            IN
          </div>
          <div
            className="gsb-ruler-h"
            style={{ left: RULER_V_PX, height: RULER_H_PX, width: contentWidthPx }}
          >
            <Ticks
              lengthIn={sheetWidthIn}
              pxPerInDisplayed={pxPerInDisplayed}
              orientation="horizontal"
            />
          </div>
          <div
            className="gsb-ruler-v"
            style={{ top: RULER_H_PX, width: RULER_V_PX, height: contentHeightPx }}
          >
            <Ticks
              lengthIn={sheetHeightIn}
              pxPerInDisplayed={pxPerInDisplayed}
              orientation="vertical"
            />
          </div>
          <div
            className="gsb-canvas-slot"
            style={{
              left: RULER_V_PX,
              top: RULER_H_PX,
              width: contentWidthPx,
              height: contentHeightPx,
            }}
          >
            <canvas ref={canvasElRef} />
            {!panning && (
              <SelectionOverlay
                selection={selection}
                sheetWidthIn={sheetWidthIn}
                sheetHeightIn={sheetHeightIn}
                onDuplicate={onDuplicateSelected}
                onDelete={onDeleteSelected}
              />
            )}
            {/* The start-here prompt is a one-time modal now (StartModal),
                so nothing is permanently parked over the middle of the sheet. */}
            {isEmpty && (
              <p className="gsb-canvas-hint">Drop or add images to begin</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
