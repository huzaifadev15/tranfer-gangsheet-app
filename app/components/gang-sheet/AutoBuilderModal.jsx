import { useMemo, useState } from "react";
import { packShelf } from "./binPacking";

const SIZE_PRESETS = [2, 3, 4, 6, 8, 10];
const MAX_QTY = 200;

function makeCard(item, index) {
  return {
    key: `${item.id}-${index}`,
    source: item,
    qty: 1,
    widthIn: item.widthIn,
    heightIn: item.heightIn,
    lockAspect: true,
  };
}

function effectiveDpi(card) {
  if (card.source.vector) return null;
  const px = card.source.widthPx;
  if (!px || !card.widthIn) return null;
  return Math.round(px / card.widthIn);
}

function DpiChip({ card }) {
  const dpi = effectiveDpi(card);
  if (card.source.vector) return <span className="gsb-dpi gsb-dpi-good">Vector</span>;
  if (dpi === null) return null;
  const tone = dpi >= 300 ? "good" : dpi >= 150 ? "warn" : "bad";
  return <span className={`gsb-dpi gsb-dpi-${tone}`}>{dpi} DPI</span>;
}

export default function AutoBuilderModal({
  library,
  sheetWidthIn,
  onCancel,
  onApply,
  onAddMore,
}) {
  const [cards, setCards] = useState(() => library.map(makeCard));
  const [canvasMarginIn, setCanvasMarginIn] = useState(0);
  const [imageMarginIn, setImageMarginIn] = useState(0.25);

  const updateCard = (key, patch) =>
    setCards((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  // Resizing one axis carries the other with it while the aspect lock is on.
  const resize = (card, axis, value) => {
    const next = Math.max(0.1, Math.min(sheetWidthIn, value));
    if (!card.lockAspect) {
      updateCard(card.key, axis === "w" ? { widthIn: next } : { heightIn: next });
      return;
    }
    const ratio = card.source.heightIn / card.source.widthIn || 1;
    updateCard(
      card.key,
      axis === "w"
        ? { widthIn: next, heightIn: next * ratio }
        : { heightIn: next, widthIn: next / ratio },
    );
  };

  const { placements, usedHeightIn, totalCount, expanded } = useMemo(() => {
    const list = [];
    cards.forEach((card) => {
      for (let i = 0; i < card.qty; i += 1) {
        list.push({
          id: `${card.key}#${i}`,
          card,
          widthIn: card.widthIn,
          heightIn: card.heightIn,
        });
      }
    });

    const packed = packShelf(list, sheetWidthIn, {
      gapIn: imageMarginIn,
      marginIn: canvasMarginIn,
    });

    return {
      placements: packed.placements,
      usedHeightIn: packed.usedHeightIn,
      totalCount: list.length,
      expanded: list,
    };
  }, [cards, sheetWidthIn, imageMarginIn, canvasMarginIn]);

  const neededFt = usedHeightIn > 0 ? Math.max(1, Math.ceil(usedHeightIn / 12)) : 0;
  const byId = new Map(placements.map((p) => [p.id, p]));

  return (
    <div className="gsb-modal-overlay" role="dialog" aria-modal="true" aria-label="Auto Builder">
      <div className="gsb-modal gsb-modal-xl">
        <div className="gsb-modal-header">
          <div>
            <h2>Auto Builder</h2>
            <p className="gsb-modal-hint">
              Set quantities for each image and we&apos;ll optimize the placement.
            </p>
          </div>
          <button type="button" className="gsb-icon-btn" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>

        <div className="gsb-ab-body">
          <section className="gsb-ab-images">
            <div className="gsb-panel-heading">Images</div>
            <div className="gsb-ab-grid">
              {cards.map((card) => (
                <div key={card.key} className="gsb-ab-card">
                  <div className="gsb-ab-thumb">
                    <img src={card.source.thumbUrl} alt="" />
                    <div className="gsb-ab-thumb-actions">
                      <button
                        type="button"
                        className="gsb-icon-btn"
                        title="Duplicate this image"
                        aria-label={`Duplicate ${card.source.label}`}
                        onClick={() =>
                          setCards((prev) => [
                            ...prev,
                            { ...card, key: `${card.key}-copy-${prev.length}` },
                          ])
                        }
                      >
                        ⧉
                      </button>
                      <button
                        type="button"
                        className="gsb-icon-btn"
                        title="Remove from layout"
                        aria-label={`Remove ${card.source.label}`}
                        onClick={() =>
                          setCards((prev) => prev.filter((c) => c.key !== card.key))
                        }
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  <p className="gsb-ab-name" title={card.source.label}>
                    {card.source.label}
                  </p>

                  <div className="gsb-ab-size">
                    <span>w</span>
                    <input
                      className="gsb-input gsb-input-tiny"
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={card.widthIn.toFixed(2)}
                      onChange={(e) => resize(card, "w", Number(e.target.value))}
                      aria-label={`Width of ${card.source.label} in inches`}
                    />
                    <span>× h</span>
                    <input
                      className="gsb-input gsb-input-tiny"
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={card.heightIn.toFixed(2)}
                      onChange={(e) => resize(card, "h", Number(e.target.value))}
                      aria-label={`Height of ${card.source.label} in inches`}
                    />
                    <span>in</span>
                    <button
                      type="button"
                      className={`gsb-icon-btn${card.lockAspect ? " gsb-icon-btn-on" : ""}`}
                      title={card.lockAspect ? "Aspect ratio locked" : "Aspect ratio unlocked"}
                      aria-pressed={card.lockAspect}
                      onClick={() => updateCard(card.key, { lockAspect: !card.lockAspect })}
                    >
                      {card.lockAspect ? "🔒" : "🔓"}
                    </button>
                  </div>

                  <div className="gsb-ab-meta">
                    <DpiChip card={card} />
                    <select
                      className="gsb-select gsb-select-sm"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) resize(card, "w", Number(e.target.value));
                      }}
                      aria-label={`Preset size for ${card.source.label}`}
                    >
                      <option value="">Custom sizing</option>
                      {SIZE_PRESETS.map((inches) => (
                        <option key={inches} value={inches}>
                          {inches}&quot; wide
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="gsb-ab-qty">
                    <span>Qty</span>
                    <button
                      type="button"
                      className="gsb-icon-btn"
                      onClick={() => updateCard(card.key, { qty: Math.max(0, card.qty - 1) })}
                      aria-label={`Decrease quantity of ${card.source.label}`}
                    >
                      −
                    </button>
                    <input
                      className="gsb-input gsb-input-tiny"
                      type="number"
                      min="0"
                      max={MAX_QTY}
                      value={card.qty}
                      onChange={(e) =>
                        updateCard(card.key, {
                          qty: Math.max(0, Math.min(MAX_QTY, Number(e.target.value) || 0)),
                        })
                      }
                      aria-label={`Quantity of ${card.source.label}`}
                    />
                    <button
                      type="button"
                      className="gsb-icon-btn"
                      onClick={() =>
                        updateCard(card.key, { qty: Math.min(MAX_QTY, card.qty + 1) })
                      }
                      aria-label={`Increase quantity of ${card.source.label}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}

              <button type="button" className="gsb-ab-add" onClick={onAddMore}>
                + Add More Images
              </button>
            </div>
          </section>

          <section className="gsb-ab-preview-pane">
            <div className="gsb-ab-preview-head">
              <span className="gsb-panel-heading">Gang sheet preview</span>
              <span className="gsb-ab-preview-size">{neededFt > 0 ? `${neededFt} ft` : "—"}</span>
            </div>

            <div className="gsb-ab-preview">
              {totalCount === 0 ? (
                <p className="gsb-ab-preview-empty">Adjust quantities to see placement</p>
              ) : (
                <div
                  className="gsb-ab-preview-sheet"
                  style={{ aspectRatio: `${sheetWidthIn} / ${Math.max(usedHeightIn, 1)}` }}
                >
                  {expanded.map((entry) => {
                    const pos = byId.get(entry.id);
                    if (!pos) return null;
                    return (
                      <img
                        key={entry.id}
                        src={entry.card.source.thumbUrl}
                        alt=""
                        className="gsb-ab-preview-item"
                        style={{
                          left: `${(pos.xIn / sheetWidthIn) * 100}%`,
                          top: `${(pos.yIn / usedHeightIn) * 100}%`,
                          width: `${(entry.widthIn / sheetWidthIn) * 100}%`,
                          height: `${(entry.heightIn / usedHeightIn) * 100}%`,
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            <div className="gsb-ab-margins">
              <label className="gsb-field">
                <span>Canvas margin</span>
                <input
                  className="gsb-input"
                  type="number"
                  min="0"
                  max="2"
                  step="0.05"
                  value={canvasMarginIn}
                  onChange={(e) => setCanvasMarginIn(Math.max(0, Number(e.target.value) || 0))}
                />
              </label>
              <label className="gsb-field">
                <span>Image margin</span>
                <input
                  className="gsb-input"
                  type="number"
                  min="0"
                  max="2"
                  step="0.05"
                  value={imageMarginIn}
                  onChange={(e) => setImageMarginIn(Math.max(0, Number(e.target.value) || 0))}
                />
              </label>
            </div>

            <dl className="gsb-stats">
              <div className="gsb-stats-row">
                <dt>Images to place</dt>
                <dd>{totalCount}</dd>
              </div>
              <div className="gsb-stats-row">
                <dt>Canvas size</dt>
                <dd>{neededFt > 0 ? `${neededFt} ft` : "—"}</dd>
              </div>
            </dl>
          </section>
        </div>

        <div className="gsb-modal-footer gsb-modal-footer-end">
          <button type="button" className="gsb-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="gsb-btn gsb-btn-primary"
            disabled={totalCount === 0}
            onClick={() =>
              onApply({
                entries: expanded.map((entry) => ({
                  item: {
                    ...entry.card.source,
                    widthIn: entry.widthIn,
                    heightIn: entry.heightIn,
                  },
                  position: byId.get(entry.id),
                })),
                neededFt,
              })
            }
          >
            Apply Layout
          </button>
        </div>
      </div>
    </div>
  );
}
