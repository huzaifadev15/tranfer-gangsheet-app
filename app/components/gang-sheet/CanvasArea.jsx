import { PX_PER_IN } from "./units";
import SelectionOverlay from "./SelectionOverlay";

const RULER_SIZE_PX = 24;

function Ticks({ lengthIn, pxPerInDisplayed, orientation }) {
  const ticks = [];
  for (let i = 0; i <= Math.ceil(lengthIn); i += 1) {
    const pos = i * pxPerInDisplayed;
    const major = i % 5 === 0;
    ticks.push(
      <span
        key={i}
        className={`gsb-tick${major ? " gsb-tick-major" : ""}`}
        style={
          orientation === "horizontal"
            ? { left: pos }
            : { top: pos }
        }
      >
        {major ? <em>{i}&quot;</em> : null}
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
}) {
  const pxPerInDisplayed = PX_PER_IN * (zoomPct / 100);
  const contentWidthPx = sheetWidthIn * pxPerInDisplayed;
  const contentHeightPx = sheetHeightIn * pxPerInDisplayed;

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
        <button type="button" className="gsb-btn gsb-btn-small" onClick={onZoomFit}>
          Fit
        </button>
        <button type="button" className="gsb-btn gsb-btn-small" onClick={onZoomReset}>
          100%
        </button>
      </div>

      <div className="gsb-viewport" ref={containerRef}>
        <div
          className="gsb-grid"
          style={{
            width: RULER_SIZE_PX + contentWidthPx,
            height: RULER_SIZE_PX + contentHeightPx,
          }}
        >
          <div className="gsb-corner" style={{ width: RULER_SIZE_PX, height: RULER_SIZE_PX }} />
          <div
            className="gsb-ruler-h"
            style={{ left: RULER_SIZE_PX, height: RULER_SIZE_PX, width: contentWidthPx }}
          >
            <Ticks lengthIn={sheetWidthIn} pxPerInDisplayed={pxPerInDisplayed} orientation="horizontal" />
          </div>
          <div
            className="gsb-ruler-v"
            style={{ top: RULER_SIZE_PX, width: RULER_SIZE_PX, height: contentHeightPx }}
          >
            <Ticks lengthIn={sheetHeightIn} pxPerInDisplayed={pxPerInDisplayed} orientation="vertical" />
          </div>
          <div
            className="gsb-canvas-slot"
            style={{ left: RULER_SIZE_PX, top: RULER_SIZE_PX, width: contentWidthPx, height: contentHeightPx }}
          >
            <canvas ref={canvasElRef} />
            <SelectionOverlay
              selection={selection}
              sheetWidthIn={sheetWidthIn}
              sheetHeightIn={sheetHeightIn}
              onDuplicate={onDuplicateSelected}
              onDelete={onDeleteSelected}
            />
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
