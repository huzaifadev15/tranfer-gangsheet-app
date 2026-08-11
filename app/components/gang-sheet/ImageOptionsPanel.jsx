import { useEffect, useState } from "react";

const GOOD_DPI = 300;
const WARN_DPI = 150;

// Common DTF placement widths, so a customer can size to a standard print
// position without measuring. Height follows from the artwork's aspect ratio.
const SIZE_PRESETS = [
  { label: "Custom sizing", widthIn: null },
  { label: 'Adult front — 11"', widthIn: 11 },
  { label: 'Adult front (wide) — 12"', widthIn: 12 },
  { label: 'Youth front — 8"', widthIn: 8 },
  { label: 'Toddler front — 6"', widthIn: 6 },
  { label: 'Left chest / pocket — 4"', widthIn: 4 },
  { label: 'Sleeve — 3.5"', widthIn: 3.5 },
  { label: 'Hat front — 2.5"', widthIn: 2.5 },
];

function dpiStatus(selection) {
  if (selection.vector) return { label: "Vector", tone: "good" };
  if (selection.dpi == null) return null;
  if (selection.dpi >= GOOD_DPI) return { label: `${GOOD_DPI}+ DPI`, tone: "good" };
  if (selection.dpi >= WARN_DPI) return { label: `${selection.dpi} DPI`, tone: "warn" };
  return { label: `${selection.dpi} DPI · low`, tone: "bad" };
}

// Inspector for the currently selected object. Dimension fields are kept as
// free text while focused so a partially-typed value ("1", "1.") isn't
// snapped back by the canvas on every keystroke; they commit on blur/Enter.
export default function ImageOptionsPanel({
  selection,
  onClose,
  onRemove,
  onResize,
  onDuplicate,
  onAutoTrim,
  onRotate,
  onFlip,
  onCenter,
  onReset,
  onRemoveBg,
  onRecolor,
  trimAvailable,
  pixelOpsAvailable,
  busyOp,
}) {
  const [lockAspect, setLockAspect] = useState(true);
  const [draft, setDraft] = useState({ width: "", height: "" });
  const [editing, setEditing] = useState(null);

  const widthIn = selection?.widthIn ?? 0;
  const heightIn = selection?.heightIn ?? 0;

  useEffect(() => {
    if (editing) return;
    setDraft({ width: widthIn.toFixed(2), height: heightIn.toFixed(2) });
  }, [widthIn, heightIn, editing]);

  if (!selection) return null;

  const status = dpiStatus(selection);
  const ratio = heightIn > 0 ? widthIn / heightIn : 1;

  const commit = (field) => {
    const value = parseFloat(draft[field]);
    setEditing(null);
    if (!Number.isFinite(value) || value <= 0) {
      setDraft({ width: widthIn.toFixed(2), height: heightIn.toFixed(2) });
      return;
    }
    if (field === "width") {
      onResize({ widthIn: value, heightIn: lockAspect ? value / ratio : null });
    } else {
      onResize({ heightIn: value, widthIn: lockAspect ? value * ratio : null });
    }
  };

  const applyPreset = (value) => {
    const preset = SIZE_PRESETS.find((p) => p.label === value);
    if (!preset?.widthIn) return;
    onResize({ widthIn: preset.widthIn, heightIn: preset.widthIn / ratio });
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setEditing(null);
      setDraft({ width: widthIn.toFixed(2), height: heightIn.toFixed(2) });
    }
  };

  return (
    <div className="gsb-options-panel">
      <div className="gsb-options-head">
        <div>
          <strong>Image Options</strong>
          <span className="gsb-options-name" title={selection.label}>
            {selection.label}
          </span>
        </div>
        <div className="gsb-options-head-actions">
          <button type="button" className="gsb-link-btn gsb-link-danger" onClick={onRemove}>
            Remove
          </button>
          <button
            type="button"
            className="gsb-icon-btn"
            onClick={onClose}
            aria-label="Close image options"
          >
            ×
          </button>
        </div>
      </div>

      <div className="gsb-options-size">
        <label className="gsb-field">
          <span>Width</span>
          <input
            type="number"
            step="0.1"
            min="0.25"
            value={draft.width}
            onChange={(e) => {
              setEditing("width");
              setDraft((d) => ({ ...d, width: e.target.value }));
            }}
            onBlur={() => commit("width")}
            onKeyDown={onKeyDown}
          />
          <em>in</em>
        </label>

        <label className="gsb-field">
          <span>Height</span>
          <input
            type="number"
            step="0.1"
            min="0.25"
            value={draft.height}
            onChange={(e) => {
              setEditing("height");
              setDraft((d) => ({ ...d, height: e.target.value }));
            }}
            onBlur={() => commit("height")}
            onKeyDown={onKeyDown}
          />
          <em>in</em>
        </label>

        <button
          type="button"
          className={`gsb-lock-btn${lockAspect ? " gsb-lock-on" : ""}`}
          onClick={() => setLockAspect((v) => !v)}
          aria-pressed={lockAspect}
          title={lockAspect ? "Aspect ratio locked" : "Aspect ratio unlocked"}
        >
          {lockAspect ? "🔒" : "🔓"}
        </button>

        {status && <span className={`gsb-dpi gsb-dpi-${status.tone}`}>{status.label}</span>}
      </div>

      <select
        className="gsb-select gsb-btn-block"
        value="Custom sizing"
        onChange={(e) => applyPreset(e.target.value)}
      >
        {SIZE_PRESETS.map((preset) => (
          <option key={preset.label} value={preset.label}>
            {preset.label}
          </option>
        ))}
      </select>

      <div className="gsb-options-group">Actions</div>
      <div className="gsb-options-grid">
        <button
          type="button"
          className="gsb-tool-btn"
          onClick={onAutoTrim}
          disabled={!trimAvailable}
          title={
            trimAvailable
              ? "Crop away transparent margins"
              : "Only available for raster artwork with transparency"
          }
        >
          <span aria-hidden="true">✂</span>
          Auto Crop &amp; Trim
        </button>
        <button type="button" className="gsb-tool-btn" onClick={onDuplicate}>
          <span aria-hidden="true">⧉</span>
          Duplicate
        </button>
      </div>

      <div className="gsb-options-group">Edit</div>
      <div className="gsb-options-grid gsb-options-grid-3">
        <button
          type="button"
          className="gsb-tool-btn"
          onClick={onRemoveBg}
          disabled={!pixelOpsAvailable || busyOp != null}
          title={
            pixelOpsAvailable
              ? "Knock out a flat background colour"
              : "Only available for raster artwork"
          }
        >
          <span aria-hidden="true">◍</span>
          {busyOp === "removeBg" ? "Working…" : "Remove BG"}
        </button>
        <button
          type="button"
          className="gsb-tool-btn"
          onClick={onRecolor}
          disabled={!pixelOpsAvailable || busyOp != null}
          title={
            pixelOpsAvailable
              ? "Swap one colour for another"
              : "Only available for raster artwork"
          }
        >
          <span aria-hidden="true">◑</span>
          Recolor
        </button>
        <button type="button" className="gsb-tool-btn" onClick={onReset}>
          <span aria-hidden="true">↺</span>
          Reset
        </button>
      </div>

      <div className="gsb-options-group">Transform</div>
      <div className="gsb-options-grid gsb-options-grid-3">
        <button type="button" className="gsb-tool-btn" onClick={() => onRotate(90)}>
          <span aria-hidden="true">⟳</span>
          Rotate
        </button>
        <button type="button" className="gsb-tool-btn" onClick={() => onFlip("x")}>
          <span aria-hidden="true">⇋</span>
          Flip H
        </button>
        <button type="button" className="gsb-tool-btn" onClick={() => onFlip("y")}>
          <span aria-hidden="true">⇅</span>
          Flip V
        </button>
        <button type="button" className="gsb-tool-btn" onClick={onCenter}>
          <span aria-hidden="true">⊹</span>
          Center
        </button>
      </div>
    </div>
  );
}
