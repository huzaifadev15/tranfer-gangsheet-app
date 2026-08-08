const GOOD_DPI = 300;
const WARN_DPI = 150;

function dpiStatus(selection) {
  if (selection.vector) return { label: "Vector", tone: "good" };
  if (selection.dpi === null) return null;
  if (selection.dpi >= GOOD_DPI) return { label: `${GOOD_DPI}+ DPI`, tone: "good" };
  if (selection.dpi >= WARN_DPI) return { label: `${selection.dpi} DPI`, tone: "warn" };
  return { label: `${selection.dpi} DPI · low`, tone: "bad" };
}

// Positioned in percentages of the sheet so it tracks the object correctly at
// any zoom level without needing to know the pixel scale.
export default function SelectionOverlay({
  selection,
  sheetWidthIn,
  sheetHeightIn,
  onDuplicate,
  onDelete,
}) {
  if (!selection) return null;

  const leftPct = (selection.boxXIn / sheetWidthIn) * 100;
  const topPct = (selection.boxYIn / sheetHeightIn) * 100;
  const widthPct = (selection.boxWIn / sheetWidthIn) * 100;
  const heightPct = (selection.boxHIn / sheetHeightIn) * 100;
  const status = dpiStatus(selection);

  return (
    <div
      className="gsb-selection-overlay"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        width: `${widthPct}%`,
        height: `${heightPct}%`,
      }}
    >
      <div className="gsb-selection-toolbar">
        <button
          type="button"
          className="gsb-selection-tool"
          onClick={onDuplicate}
          title="Duplicate"
          aria-label="Duplicate selection"
        >
          ⧉
        </button>
        <button
          type="button"
          className="gsb-selection-tool gsb-selection-tool-danger"
          onClick={onDelete}
          title="Delete"
          aria-label="Delete selection"
        >
          🗑
        </button>
      </div>

      <div className="gsb-selection-badge">
        <span>
          w <strong>{selection.widthIn.toFixed(1)}&quot;</strong>
        </span>
        <span>
          h <strong>{selection.heightIn.toFixed(1)}&quot;</strong>
        </span>
        {status && (
          <span className={`gsb-dpi gsb-dpi-${status.tone}`}>{status.label}</span>
        )}
      </div>
    </div>
  );
}
