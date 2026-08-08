export default function RightPanel({ imageCount, sheetLengthFt, coveragePct, onSave, saveStatus }) {
  return (
    <aside className="gsb-right-panel">
      <button type="button" className="gsb-btn gsb-btn-block" onClick={onSave}>
        Save Gang Sheet
      </button>
      <button
        type="button"
        className="gsb-btn gsb-btn-primary gsb-btn-block"
        disabled
        title="Coming soon"
      >
        Add to Cart
      </button>
      {saveStatus && <p className="gsb-save-status">{saveStatus}</p>}

      <dl className="gsb-stats">
        <div className="gsb-stats-row">
          <dt>Images</dt>
          <dd>{imageCount}</dd>
        </div>
        <div className="gsb-stats-row">
          <dt>Gang Sheet ({sheetLengthFt} ft)</dt>
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
