import { SOURCE_DPI } from "./units";

const LOW_DPI_THRESHOLD = 150;

function formatInches(value) {
  return `${value.toFixed(1)}"`;
}

// Effective print resolution once the artwork is placed at its current
// physical size — the number that actually decides whether it prints sharp.
function effectiveDpi(item) {
  if (item.vector) return null;
  if (!item.widthPx || !item.widthIn) return SOURCE_DPI;
  return Math.round(item.widthPx / item.widthIn);
}

export default function ImageLibrary({ items, onPlace, onRemove, onClear }) {
  if (items.length === 0) return null;

  return (
    <div className="gsb-library">
      <div className="gsb-library-head">
        <span>
          {items.length} uploaded image{items.length === 1 ? "" : "s"}
        </span>
        <button type="button" className="gsb-link-btn" onClick={onClear}>
          Clear
        </button>
      </div>

      <ul className="gsb-library-list">
        {items.map((item) => {
          const dpi = effectiveDpi(item);
          const lowRes = dpi !== null && dpi < LOW_DPI_THRESHOLD;

          return (
            <li key={item.id} className="gsb-library-item">
              <button
                type="button"
                className="gsb-library-thumb"
                onClick={() => onPlace(item)}
                title="Add to sheet"
              >
                <img src={item.thumbUrl} alt="" />
              </button>

              <div className="gsb-library-meta">
                <span className="gsb-library-name" title={item.label}>
                  {item.label}
                </span>
                <span className="gsb-library-dims">
                  {formatInches(item.widthIn)} × {formatInches(item.heightIn)}
                  {item.vector && <span className="gsb-badge">vector</span>}
                </span>
                {lowRes && (
                  <span className="gsb-library-warning">Low resolution ({dpi} DPI)</span>
                )}
              </div>

              <div className="gsb-library-actions">
                <button
                  type="button"
                  className="gsb-icon-btn"
                  onClick={() => onPlace(item)}
                  aria-label={`Add ${item.label} to sheet`}
                  title="Add to sheet"
                >
                  +
                </button>
                <button
                  type="button"
                  className="gsb-icon-btn"
                  onClick={() => onRemove(item.id)}
                  aria-label={`Remove ${item.label}`}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
