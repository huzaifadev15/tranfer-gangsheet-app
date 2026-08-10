import { useMemo, useState } from "react";
import { packShelf } from "./binPacking";
import {
  TEXT_FONTS,
  DEFAULT_FONT_ID,
  getTextFont,
  measureTextTile,
  renderTextTile,
} from "./textTiles";

const MODES = [
  { id: "name-number", label: "Name + Number", sample: ["Smith", "25"] },
  { id: "name", label: "Name Only", sample: ["Smith"] },
  { id: "number", label: "Number Only", sample: ["25"] },
];

// Jersey sizing conventions: names ride above the number and are printed much
// smaller, so each preset carries both heights rather than one scale factor.
const SIZES = [
  { id: "small", label: "Small", nameIn: 1, numberIn: 4 },
  { id: "medium", label: "Medium", nameIn: 1.5, numberIn: 6 },
  { id: "large", label: "Large", nameIn: 2, numberIn: 8 },
];

const SWATCHES = [
  { hex: "#000000", label: "Black" },
  { hex: "#ffffff", label: "White" },
  { hex: "#c8102e", label: "Red" },
  { hex: "#14213d", label: "Navy" },
  { hex: "#1d4ed8", label: "Royal" },
  { hex: "#f5b301", label: "Gold" },
  { hex: "#0f7b3f", label: "Green" },
  { hex: "#9aa0a6", label: "Silver" },
];

const MAX_QTY = 99;
const PREVIEW_DPI = 96;

let rowSeq = 0;
function makeRow() {
  rowSeq += 1;
  return { key: `row-${rowSeq}`, name: "", number: "", qty: 1 };
}

function colorName(hex) {
  const match = SWATCHES.find((s) => s.hex.toLowerCase() === hex.toLowerCase());
  return match ? match.label : hex.toUpperCase();
}

function Info({ text }) {
  return (
    <span className="gsb-nn-info" title={text} aria-label={text} role="img">
      ⓘ
    </span>
  );
}

function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`gsb-switch${checked ? " gsb-switch-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="gsb-switch-knob" />
    </button>
  );
}

function ColorPicker({ value, onChange, label }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="gsb-nn-color">
      <span className="gsb-nn-swatch" style={{ background: value }} />
      <span className="gsb-nn-color-name">{colorName(value)}</span>
      <button type="button" className="gsb-nn-link" onClick={() => setOpen((v) => !v)}>
        Edit
      </button>

      {open && (
        <div className="gsb-nn-color-pop">
          <div className="gsb-nn-color-grid">
            {SWATCHES.map((swatch) => (
              <button
                key={swatch.hex}
                type="button"
                className={`gsb-nn-swatch gsb-nn-swatch-btn${
                  swatch.hex.toLowerCase() === value.toLowerCase() ? " gsb-nn-swatch-on" : ""
                }`}
                style={{ background: swatch.hex }}
                title={swatch.label}
                aria-label={`${label}: ${swatch.label}`}
                onClick={() => {
                  onChange(swatch.hex);
                  setOpen(false);
                }}
              />
            ))}
          </div>
          <label className="gsb-nn-color-custom">
            <span>Custom</span>
            <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
          </label>
        </div>
      )}
    </div>
  );
}

export default function NamesNumbersModal({ sheetWidthIn, onClose, onSubmit, busy }) {
  const [mode, setMode] = useState(MODES[0].id);
  const [rows, setRows] = useState(() => [makeRow()]);
  const [sizeId, setSizeId] = useState("medium");
  const [fontId, setFontId] = useState(DEFAULT_FONT_ID);
  const [color, setColor] = useState("#000000");
  const [outline, setOutline] = useState(false);
  const [outlineColor, setOutlineColor] = useState("#ffffff");
  const [canvasMarginIn, setCanvasMarginIn] = useState(0);
  const [imageSpacingIn, setImageSpacingIn] = useState(0.25);
  const [compact, setCompact] = useState(false);
  const [enlarged, setEnlarged] = useState(false);

  const size = SIZES.find((s) => s.id === sizeId) ?? SIZES[1];
  const showName = mode !== "number";
  const showNumber = mode !== "name";

  const updateRow = (key, patch) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  // Every line a row contributes, measured but not yet rasterised — cheap
  // enough to recompute on each keystroke so the footer stats stay live.
  const tiles = useMemo(() => {
    const maxWidthIn = Math.max(1, sheetWidthIn - canvasMarginIn * 2);
    const list = [];

    rows.forEach((row) => {
      const parts = [];
      if (showName && row.name.trim()) {
        parts.push({ text: row.name.trim(), heightIn: size.nameIn });
      }
      if (showNumber && row.number.trim()) {
        parts.push({ text: row.number.trim(), heightIn: size.numberIn });
      }

      const qty = Math.max(0, Math.min(MAX_QTY, row.qty || 0));
      for (let copy = 0; copy < qty; copy += 1) {
        parts.forEach((part, partIndex) => {
          const measured = measureTextTile(part.text, {
            fontId,
            heightIn: part.heightIn,
            outline,
          });
          // A long name at 2" tall can outrun the roll; scale the whole tile
          // down rather than letting it hang off the edge of the sheet.
          const scale = measured.widthIn > maxWidthIn ? maxWidthIn / measured.widthIn : 1;
          list.push({
            id: `${row.key}-${copy}-${partIndex}`,
            text: part.text,
            targetHeightIn: part.heightIn,
            widthIn: measured.widthIn * scale,
            heightIn: measured.heightIn * scale,
          });
        });
      }
    });

    return list;
  }, [rows, showName, showNumber, size, fontId, outline, sheetWidthIn, canvasMarginIn]);

  const { placements, usedHeightIn } = useMemo(
    () =>
      packShelf(tiles, sheetWidthIn, {
        gapIn: imageSpacingIn,
        marginIn: canvasMarginIn,
        keepOrder: !compact,
      }),
    [tiles, sheetWidthIn, imageSpacingIn, canvasMarginIn, compact],
  );

  const neededFt = usedHeightIn > 0 ? Math.max(1, Math.ceil(usedHeightIn / 12)) : 0;
  const filledCount = rows.filter(
    (row) => (showName && row.name.trim()) || (showNumber && row.number.trim()),
  ).length;

  // Previews the first filled row, falling back to placeholder text so the
  // panel shows the chosen font, colour and size before anything is typed.
  const preview = useMemo(() => {
    const first = rows.find((row) => row.name.trim() || row.number.trim());
    const lines = [];
    if (showName) {
      lines.push({ text: first?.name.trim() || "PLAYER", heightIn: size.nameIn });
    }
    if (showNumber) {
      lines.push({ text: first?.number.trim() || "00", heightIn: size.numberIn });
    }
    return lines.map((line, index) => ({
      key: `${index}-${line.text}`,
      heightIn: line.heightIn,
      ...renderTextTile(line.text, {
        fontId,
        heightIn: line.heightIn,
        color,
        outline,
        outlineColor,
        dpi: PREVIEW_DPI,
      }),
    }));
  }, [rows, showName, showNumber, size, fontId, color, outline, outlineColor]);

  const previewTotalIn = preview.reduce((sum, line) => sum + line.heightIn, 0) || 1;

  const handleGenerate = () => {
    const byId = new Map(placements.map((p) => [p.id, p]));
    const entries = tiles.map((tile) => {
      const raster = renderTextTile(tile.text, {
        fontId,
        heightIn: tile.targetHeightIn,
        color,
        outline,
        outlineColor,
      });
      return {
        item: {
          id: `text-${tile.id}-${Date.now()}`,
          kind: "text",
          label: tile.text,
          dataUrl: raster.dataUrl,
          widthIn: tile.widthIn,
          heightIn: tile.heightIn,
          widthPx: raster.widthPx,
          heightPx: raster.heightPx,
        },
        position: byId.get(tile.id),
      };
    });

    onSubmit({ entries, neededFt, gapIn: imageSpacingIn, marginIn: canvasMarginIn });
  };

  return (
    <div className="gsb-modal-overlay" role="dialog" aria-modal="true" aria-label="Names & Numbers">
      <div className="gsb-modal gsb-modal-lg">
        <div className="gsb-modal-header">
          <div>
            <h2>
              <span className="gsb-nn-title-icon" aria-hidden="true">
                T
              </span>
              Names &amp; Numbers
            </h2>
            <p className="gsb-modal-hint">
              Create text graphics for team names and jersey numbers.
            </p>
          </div>
          <button type="button" className="gsb-icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="gsb-nn-body">
          <section className="gsb-nn-main">
            <div className="gsb-nn-modes">
              {MODES.map((option) => (
                <div key={option.id} className="gsb-nn-mode-wrap">
                  <button
                    type="button"
                    className={`gsb-nn-mode${mode === option.id ? " gsb-nn-mode-on" : ""}`}
                    aria-pressed={mode === option.id}
                    onClick={() => setMode(option.id)}
                  >
                    {option.sample.map((line) => (
                      <span key={line} className="gsb-nn-mode-line">
                        {line}
                      </span>
                    ))}
                  </button>
                  <span className="gsb-nn-mode-label">{option.label}</span>
                </div>
              ))}
            </div>

            <div className="gsb-panel-heading gsb-nn-entries-heading">
              Entries ({filledCount})
            </div>

            <div className="gsb-nn-table">
              <div className="gsb-nn-row gsb-nn-row-head">
                <span className="gsb-nn-c-index" />
                {showName && <span className="gsb-nn-c-name">Name</span>}
                {showNumber && <span className="gsb-nn-c-num">#</span>}
                <span className="gsb-nn-c-qty">Qty</span>
                <span className="gsb-nn-c-del" />
              </div>

              {rows.map((row, index) => (
                <div key={row.key} className="gsb-nn-row">
                  <span className="gsb-nn-c-index">{index + 1}.</span>
                  {showName && (
                    <input
                      className="gsb-input gsb-nn-c-name"
                      type="text"
                      placeholder="Name"
                      value={row.name}
                      onChange={(e) => updateRow(row.key, { name: e.target.value })}
                      aria-label={`Name for entry ${index + 1}`}
                    />
                  )}
                  {showNumber && (
                    <input
                      className="gsb-input gsb-nn-c-num"
                      type="text"
                      inputMode="numeric"
                      placeholder="#"
                      value={row.number}
                      onChange={(e) => updateRow(row.key, { number: e.target.value })}
                      aria-label={`Number for entry ${index + 1}`}
                    />
                  )}
                  <input
                    className="gsb-input gsb-nn-c-qty"
                    type="number"
                    min="1"
                    max={MAX_QTY}
                    value={row.qty}
                    onChange={(e) =>
                      updateRow(row.key, {
                        qty: Math.max(1, Math.min(MAX_QTY, Number(e.target.value) || 1)),
                      })
                    }
                    aria-label={`Quantity for entry ${index + 1}`}
                  />
                  <button
                    type="button"
                    className="gsb-icon-btn gsb-nn-c-del"
                    onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                    aria-label={`Remove entry ${index + 1}`}
                    title="Remove entry"
                  >
                    🗑
                  </button>
                </div>
              ))}

              <button
                type="button"
                className="gsb-nn-add"
                onClick={() => setRows((prev) => [...prev, makeRow()])}
              >
                + Add
              </button>
            </div>
          </section>

          <aside className="gsb-nn-side">
            <button
              type="button"
              className="gsb-nn-preview"
              onClick={() => setEnlarged(true)}
              aria-label="Enlarge preview"
            >
              {preview.map((line) => (
                <img
                  key={line.key}
                  src={line.dataUrl}
                  alt=""
                  className="gsb-nn-preview-img"
                  style={{ height: `${(line.heightIn / previewTotalIn) * 100}%` }}
                />
              ))}
            </button>
            <span className="gsb-nn-preview-hint">Click to enlarge</span>

            <div className="gsb-nn-field-label">Size</div>
            <div className="gsb-nn-sizes">
              {SIZES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`gsb-nn-size${sizeId === option.id ? " gsb-nn-size-on" : ""}`}
                  aria-pressed={sizeId === option.id}
                  onClick={() => setSizeId(option.id)}
                >
                  <strong>{option.label}</strong>
                  <span>Name: {option.nameIn}&quot;h</span>
                  <span>Number: {option.numberIn}&quot;h</span>
                </button>
              ))}
            </div>

            <label className="gsb-nn-field">
              <span className="gsb-nn-field-label">Font</span>
              <select
                className="gsb-select gsb-nn-font"
                style={{ fontFamily: getTextFont(fontId).stack }}
                value={fontId}
                onChange={(e) => setFontId(e.target.value)}
              >
                {TEXT_FONTS.map((font) => (
                  <option key={font.id} value={font.id}>
                    {font.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="gsb-nn-field-label">Text Color</div>
            <ColorPicker value={color} onChange={setColor} label="Text colour" />

            <div className="gsb-nn-toggle-row">
              <span className="gsb-nn-field-label">Text Outline</span>
              <Switch checked={outline} onChange={setOutline} label="Text outline" />
            </div>

            {outline && (
              <ColorPicker value={outlineColor} onChange={setOutlineColor} label="Outline colour" />
            )}
          </aside>
        </div>

        <div className="gsb-nn-footer-bar">
          <div className="gsb-nn-footer-field">
            <span className="gsb-nn-footer-label">
              Canvas Size <Info text="Sheet length this roster needs at the current spacing." />
            </span>
            <strong className="gsb-nn-footer-value">{neededFt > 0 ? `${neededFt} ft` : "—"}</strong>
          </div>

          <label className="gsb-nn-footer-field">
            <span className="gsb-nn-footer-label">Canvas Margin</span>
            <span className="gsb-nn-unit">
              <input
                className="gsb-input"
                type="number"
                min="0"
                max="2"
                step="0.05"
                value={canvasMarginIn}
                onChange={(e) => setCanvasMarginIn(Math.max(0, Number(e.target.value) || 0))}
              />
              in
            </span>
          </label>

          <label className="gsb-nn-footer-field">
            <span className="gsb-nn-footer-label">Image Spacing</span>
            <span className="gsb-nn-unit">
              <input
                className="gsb-input"
                type="number"
                min="0"
                max="2"
                step="0.05"
                value={imageSpacingIn}
                onChange={(e) => setImageSpacingIn(Math.max(0, Number(e.target.value) || 0))}
              />
              in
            </span>
          </label>

          <div className="gsb-nn-footer-field">
            <span className="gsb-nn-footer-label">
              Compact{" "}
              <Info text="Pack tallest first to save sheet length. Off keeps entries in roster order." />
            </span>
            <Switch checked={compact} onChange={setCompact} label="Compact packing" />
          </div>
        </div>

        <div className="gsb-modal-footer gsb-modal-footer-end">
          <button type="button" className="gsb-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="gsb-btn gsb-btn-primary"
            disabled={busy || tiles.length === 0}
            onClick={handleGenerate}
          >
            {busy ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>

      {enlarged && (
        <button
          type="button"
          className="gsb-nn-lightbox"
          onClick={() => setEnlarged(false)}
          aria-label="Close preview"
        >
          <span className="gsb-nn-lightbox-sheet">
            {preview.map((line) => (
              <img
                key={line.key}
                src={line.dataUrl}
                alt=""
                className="gsb-nn-preview-img"
                style={{ height: `${(line.heightIn / previewTotalIn) * 100}%` }}
              />
            ))}
          </span>
        </button>
      )}
    </div>
  );
}
