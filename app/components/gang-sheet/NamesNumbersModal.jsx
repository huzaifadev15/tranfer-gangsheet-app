import { useState } from "react";
import { parseRoster } from "./textTiles";

export default function NamesNumbersModal({ onClose, onSubmit, busy }) {
  const [rosterText, setRosterText] = useState("");
  const [fontSizePt, setFontSizePt] = useState(48);
  const [color, setColor] = useState("#111111");

  const names = parseRoster(rosterText);

  return (
    <div className="gsb-modal-overlay" role="dialog" aria-modal="true" aria-label="Names & Numbers">
      <div className="gsb-modal">
        <div className="gsb-modal-header">
          <h2>Names &amp; Numbers</h2>
          <button type="button" className="gsb-icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <p className="gsb-modal-hint">
          One name or number per line. Each line becomes its own tile, auto-arranged onto the sheet.
        </p>

        <textarea
          className="gsb-textarea"
          rows={8}
          placeholder={"JOHNSON 12\nSMITH 7\nDAVIS 23"}
          value={rosterText}
          onChange={(e) => setRosterText(e.target.value)}
        />

        <div className="gsb-modal-row">
          <label className="gsb-field">
            <span>Font size (pt)</span>
            <input
              className="gsb-input"
              type="number"
              min={12}
              max={200}
              value={fontSizePt}
              onChange={(e) => setFontSizePt(Number(e.target.value) || 48)}
            />
          </label>
          <label className="gsb-field">
            <span>Color</span>
            <input
              className="gsb-input"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
        </div>

        <div className="gsb-modal-footer">
          <span className="gsb-modal-count">{names.length} tile{names.length === 1 ? "" : "s"}</span>
          <div className="gsb-modal-actions">
            <button type="button" className="gsb-btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="gsb-btn gsb-btn-primary"
              disabled={busy || names.length === 0}
              onClick={() => onSubmit(rosterText, { fontSizePt, color })}
            >
              {busy ? "Generating…" : "Generate"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
