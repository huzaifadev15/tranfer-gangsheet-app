import { useEffect, useRef } from "react";

function Toggle({ label, hint, checked, onChange }) {
  return (
    <div className="gsb-settings-row">
      <span className="gsb-settings-label" title={hint}>
        {label}
      </span>
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
    </div>
  );
}

// Canvas-wide preferences, anchored under the gear in the topbar. Margins are
// in inches and feed the packing routines directly, so changing one and
// re-running Tidy Canvas visibly changes the layout.
export default function SettingsPopover({ settings, onChange, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    function onPointerDown(e) {
      if (!ref.current?.contains(e.target)) onClose();
    }
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const patch = (key) => (value) => onChange({ ...settings, [key]: value });

  const numberField = (key, label, hint) => (
    <label className="gsb-field">
      <span title={hint}>{label}</span>
      <input
        type="number"
        min="0"
        max="6"
        step="0.25"
        value={settings[key]}
        onChange={(e) => {
          const next = parseFloat(e.target.value);
          patch(key)(Number.isFinite(next) ? Math.max(0, Math.min(6, next)) : 0);
        }}
      />
      <em>in</em>
    </label>
  );

  return (
    <div className="gsb-settings-popover" ref={ref} role="dialog" aria-label="Canvas settings">
      <strong className="gsb-settings-title">Settings</strong>

      <div className="gsb-settings-fields">
        {numberField("canvasMarginIn", "Canvas Margin", "Blank border kept around the sheet edge")}
        {numberField("imageMarginIn", "Image Margin", "Minimum gap between two designs")}
      </div>

      <Toggle
        label="Show Image Borders"
        hint="Outline every placed design so spacing is visible"
        checked={settings.showImageBorders}
        onChange={patch("showImageBorders")}
      />
      <Toggle
        label="Image Snapping"
        hint="Snap dragged designs to a 0.25in grid"
        checked={settings.imageSnapping}
        onChange={patch("imageSnapping")}
      />
      <Toggle
        label="Allow Overlaps"
        hint="Stop warning when designs touch or overlap"
        checked={settings.allowOverlaps}
        onChange={patch("allowOverlaps")}
      />
    </div>
  );
}
