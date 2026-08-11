import { useRef } from "react";
import { PX_PER_IN } from "./units";
import SelectionOverlay from "./SelectionOverlay";

const RULER_SIZE_PX = 28;
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
  onManualBuildCta,
  onAutoBuildCta,
  onNamesNumbersCta,
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
      <div className="gsb-zoom-bar">
        <div className="gsb-history-group">
          <button
            type="button"
            className="gsb-btn gsb-btn-small"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            ↺ Undo
          </button>
          <button
            type="button"
            className="gsb-btn gsb-btn-small"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
          >
            ↻ Redo
          </button>
        </div>
        <span className="gsb-zoom-spacer" />
        <button type="button" className="gsb-icon-btn" onClick={onZoomOut} aria-label="Zoom out">
          −
        </button>
        <span className="gsb-zoom-readout">{zoomPct}%</span>
        <button type="button" className="gsb-icon-btn" onClick={onZoomIn} aria-label="Zoom in">
          +
        </button>
        <button
          type="button"
          className="gsb-btn gsb-btn-small"
          onClick={onZoomFit}
          title="Fit sheet width"
        >
          ↔ Fit
        </button>
        <button type="button" className="gsb-btn gsb-btn-small" onClick={onZoomReset}>
          100%
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
            width: RULER_SIZE_PX + contentWidthPx,
            height: RULER_SIZE_PX + contentHeightPx,
          }}
        >
          <div className="gsb-corner" style={{ width: RULER_SIZE_PX, height: RULER_SIZE_PX }}>
            IN
          </div>
          <div
            className="gsb-ruler-h"
            style={{ left: RULER_SIZE_PX, height: RULER_SIZE_PX, width: contentWidthPx }}
          >
            <Ticks
              lengthIn={sheetWidthIn}
              pxPerInDisplayed={pxPerInDisplayed}
              orientation="horizontal"
            />
          </div>
          <div
            className="gsb-ruler-v"
            style={{ top: RULER_SIZE_PX, width: RULER_SIZE_PX, height: contentHeightPx }}
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
              left: RULER_SIZE_PX,
              top: RULER_SIZE_PX,
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
            {isEmpty && (
              <div className="gsb-empty-state">
                <h2>Start Building Your Gang Sheet</h2>
                <p>Upload your designs and we&apos;ll arrange them efficiently.</p>
                <div className="gsb-empty-cards">
                  <button type="button" className="gsb-empty-card" onClick={onAutoBuildCta}>
                    <strong>+ Auto Build</strong>
                    <span>Add images in bulk</span>
                  </button>
                  <button type="button" className="gsb-empty-card" onClick={onManualBuildCta}>
                    <strong>+ Manual Build</strong>
                    <span>Add images one at a time</span>
                  </button>
                  <button type="button" className="gsb-empty-card" onClick={onNamesNumbersCta}>
                    <strong>T Names &amp; Numbers</strong>
                    <span>Generate text tiles</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
