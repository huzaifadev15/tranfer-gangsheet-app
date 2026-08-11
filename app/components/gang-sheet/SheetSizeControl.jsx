const PRESETS_FT = [2, 5, 7, 10, 15, 20, 30, 40];
const MAX_FT = 40;

export default function SheetSizeControl({ valueFt, onChange }) {
  const isPreset = PRESETS_FT.includes(valueFt);

  return (
    <div className="gsb-sheet-size">
      <select
        className="gsb-select"
        value={isPreset ? String(valueFt) : "custom"}
        onChange={(e) => {
          if (e.target.value === "custom") {
            onChange(Math.max(1, Math.min(MAX_FT, valueFt || 6)));
          } else {
            onChange(Number(e.target.value));
          }
        }}
        aria-label="Sheet length"
      >
        {PRESETS_FT.map((ft) => (
          <option key={ft} value={ft}>
            {ft} ft
          </option>
        ))}
        <option value="custom">Custom</option>
      </select>
      {!isPreset && (
        <input
          className="gsb-input gsb-input-narrow"
          type="number"
          min={1}
          max={MAX_FT}
          step={0.5}
          value={valueFt}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (!Number.isNaN(next)) {
              onChange(Math.max(1, Math.min(MAX_FT, next)));
            }
          }}
          aria-label="Custom sheet length in feet"
        />
      )}
      <span className="gsb-sheet-size-suffix">ft long · 22in wide</span>
    </div>
  );
}
