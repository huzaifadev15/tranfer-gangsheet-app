import { useEffect, useMemo, useState } from "react";
import { extractPalette, replaceColors } from "./imageOps";

// Print-friendly swatches: neutrals, then a spectrum. Matches the shape of
// Ninja's picker without copying its exact palette.
const TARGET_COLORS = [
  "#ffffff", "#e6e6e6", "#c9c9c9", "#9b9b9b", "#6b6b6b", "#3d3d3d", "#000000",
  "#f7c6c0", "#ef6351", "#d7263d", "#8c1c13", "#f2d5a0", "#f4a261", "#e76f51",
  "#f6e05e", "#e9c46a", "#b08968", "#7f5539", "#a7d7a1", "#43aa8b", "#1b7f5c",
  "#0f5132", "#9ee0e6", "#2a9d8f", "#7cc4f5", "#3b82f6", "#1d4ed8", "#14213d",
  "#c3b4f5", "#7c5cf5", "#5b21b6", "#f5a3c7", "#ec4899", "#be185d", "#701a45",
];

export default function RecolorModal({ element, label, onApply, onCancel }) {
  const [replacements, setReplacements] = useState({});
  const [selectedFrom, setSelectedFrom] = useState(null);
  const [tolerance, setTolerance] = useState(48);
  const [result, setResult] = useState(null);
  const [working, setWorking] = useState(false);

  const palette = useMemo(() => extractPalette(element, 6), [element]);

  useEffect(() => {
    if (!selectedFrom && palette.length > 0) setSelectedFrom(palette[0]);
  }, [palette, selectedFrom]);

  // Re-render the preview whenever a rule or the tolerance changes. Debounced
  // because a full-resolution pixel pass on a 300dpi file isn't instant.
  useEffect(() => {
    const rules = Object.entries(replacements).map(([from, to]) => ({ from, to }));
    if (rules.length === 0) {
      setResult(null);
      return undefined;
    }
    setWorking(true);
    const timer = setTimeout(() => {
      setResult(replaceColors(element, rules, tolerance));
      setWorking(false);
    }, 120);
    return () => clearTimeout(timer);
  }, [replacements, tolerance, element]);

  const originalUrl = element?.src ?? null;

  return (
    <div className="gsb-modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="gsb-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Replace colors"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gsb-modal-head">
          <div>
            <h2 className="gsb-modal-title">Replace Colors</h2>
            <p className="gsb-modal-sub">
              Select a color in your image, then choose what to change it to. Works best on logos
              and flat-color artwork.
            </p>
          </div>
          <button
            type="button"
            className="gsb-icon-btn"
            onClick={onCancel}
            aria-label="Close replace colors"
          >
            ×
          </button>
        </div>

        <div className="gsb-recolor-preview">
          <span className="gsb-preview-tag gsb-preview-tag-left">Original</span>
          <span className="gsb-preview-tag gsb-preview-tag-right">
            {working ? "Working…" : "Result"}
          </span>
          <div className="gsb-recolor-split">
            <div className="gsb-recolor-half">
              {originalUrl && <img src={originalUrl} alt={`${label} before recoloring`} />}
            </div>
            <div className="gsb-recolor-half">
              <img src={result?.dataUrl ?? originalUrl} alt={`${label} after recoloring`} />
            </div>
          </div>
        </div>

        <div className="gsb-recolor-controls">
          <div className="gsb-panel-heading">Select a color to change</div>
          {palette.length === 0 ? (
            <p className="gsb-modal-body">
              Couldn&apos;t read this image&apos;s colors. Re-upload it as a PNG or JPG and try
              again.
            </p>
          ) : (
            <div className="gsb-swatch-row">
              {palette.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`gsb-swatch${selectedFrom === color ? " gsb-swatch-active" : ""}`}
                  style={{ background: color }}
                  onClick={() => setSelectedFrom(color)}
                  aria-label={`Source color ${color}`}
                  aria-pressed={selectedFrom === color}
                >
                  {replacements[color] && (
                    <span className="gsb-swatch-dot" style={{ background: replacements[color] }} />
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="gsb-recolor-head">
            <div className="gsb-panel-heading">Choose a new color</div>
            <label className="gsb-tolerance">
              <span>Tolerance</span>
              <input
                type="range"
                min="8"
                max="120"
                step="4"
                value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              className="gsb-link-btn"
              onClick={() => {
                if (!selectedFrom) return;
                setReplacements((prev) => {
                  const next = { ...prev };
                  delete next[selectedFrom];
                  return next;
                });
              }}
            >
              Reset color
            </button>
          </div>

          <div className="gsb-swatch-grid">
            {TARGET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`gsb-swatch${
                  selectedFrom && replacements[selectedFrom] === color ? " gsb-swatch-active" : ""
                }`}
                style={{ background: color }}
                disabled={!selectedFrom}
                onClick={() =>
                  setReplacements((prev) => ({ ...prev, [selectedFrom]: color }))
                }
                aria-label={`Change to ${color}`}
              />
            ))}
          </div>
        </div>

        <div className="gsb-modal-actions">
          <button
            type="button"
            className="gsb-link-btn"
            onClick={() => setReplacements({})}
            disabled={Object.keys(replacements).length === 0}
          >
            ↺ Reset Colors
          </button>
          <span className="gsb-modal-spacer" />
          <button type="button" className="gsb-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="gsb-btn gsb-btn-primary"
            disabled={!result || working}
            onClick={() => onApply(result)}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
