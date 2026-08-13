import Icon from "./Icon";

const GOOD_DPI = 300;
const WARN_DPI = 150;

function dpiBadge(item) {
  if (item.vector) return { label: "Vector", tone: "good" };
  if (item.dpi == null) return null;
  if (item.dpi >= GOOD_DPI) return { label: `${GOOD_DPI}+ DPI`, tone: "good" };
  if (item.dpi >= WARN_DPI) return { label: `${item.dpi} DPI`, tone: "warn" };
  return { label: `${item.dpi} DPI`, tone: "bad" };
}

// Placed artwork is grouped by design (label + printed size) so a sheet of 40
// copies reads as one row with a count, not 40 rows.
function groupItems(items) {
  const groups = new Map();
  items.forEach((item) => {
    const key = `${item.label}|${item.widthIn.toFixed(2)}x${item.heightIn.toFixed(2)}`;
    const existing = groups.get(key);
    if (existing) existing.ids.push(item.id);
    else groups.set(key, { key, sample: item, ids: [item.id] });
  });
  return [...groups.values()];
}

export default function RightPanel({
  items,
  sheetLengthFt,
  material,
  coveragePct,
  onSave,
  saveStatus,
  onSelectItem,
  onRemoveItem,
  onDuplicateItem,
  selectedId,
}) {
  const groups = groupItems(items);

  return (
    <aside className="gsb-right-panel">
      <button type="button" className="gsb-btn gsb-btn-block" onClick={onSave}>
        <Icon name="save" />
        Save Gang Sheet
      </button>
      <button
        type="button"
        className="gsb-btn gsb-btn-primary gsb-btn-block"
        disabled
        title="Coming soon"
      >
        <Icon name="cart" />
        Add to Cart
      </button>
      {saveStatus && <p className="gsb-save-status">{saveStatus}</p>}

      <div className="gsb-sheet-list">
        <div className="gsb-panel-heading">Sheet 1</div>
        {groups.length === 0 ? (
          <p className="gsb-sheet-empty">Nothing placed yet.</p>
        ) : (
          <ul className="gsb-sheet-items">
            {groups.map((group) => {
              const badge = dpiBadge(group.sample);
              const active = group.ids.includes(selectedId);
              return (
                <li
                  key={group.key}
                  className={`gsb-sheet-item${active ? " gsb-sheet-item-active" : ""}`}
                >
                  <button
                    type="button"
                    className="gsb-sheet-thumb"
                    onClick={() => onSelectItem(group.ids[0])}
                    title="Select on canvas"
                  >
                    {group.sample.thumbUrl ? (
                      <img src={group.sample.thumbUrl} alt="" />
                    ) : (
                      <span aria-hidden="true">T</span>
                    )}
                  </button>

                  <div className="gsb-sheet-meta">
                    <span className="gsb-sheet-name" title={group.sample.label}>
                      {group.sample.label}
                    </span>
                    <span className="gsb-sheet-dims">
                      {group.sample.widthIn.toFixed(1)}&quot; ×{" "}
                      {group.sample.heightIn.toFixed(1)}&quot;
                      {badge && (
                        <span className={`gsb-dpi gsb-dpi-${badge.tone}`}>{badge.label}</span>
                      )}
                    </span>
                  </div>

                  <div className="gsb-sheet-qty">
                    <button
                      type="button"
                      className="gsb-icon-btn"
                      onClick={() => onRemoveItem(group.ids[group.ids.length - 1])}
                      aria-label={`Remove one copy of ${group.sample.label}`}
                    >
                      −
                    </button>
                    <span className="gsb-sheet-count">{group.ids.length}</span>
                    <button
                      type="button"
                      className="gsb-icon-btn"
                      onClick={() => onDuplicateItem(group.ids[0])}
                      aria-label={`Add one copy of ${group.sample.label}`}
                    >
                      +
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Totals sit at the foot of the panel, below the sheet contents. */}
      <dl className="gsb-stats gsb-stats-footer">
        <div className="gsb-stats-row">
          <dt>Images</dt>
          <dd>{items.length}</dd>
        </div>
        <div className="gsb-stats-row">
          <dt>
            {material} Gang Sheet ({sheetLengthFt} ft)
          </dt>
          <dd className="gsb-stats-muted">Priced at checkout</dd>
        </div>
        <div className="gsb-stats-row">
          <dt>Image Coverage</dt>
          <dd>{coveragePct}%</dd>
        </div>
      </dl>
    </aside>
  );
}
