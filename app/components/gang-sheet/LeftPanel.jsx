import { useState } from "react";

export default function LeftPanel({
  onAddImagesClick,
  onFilesDropped,
  onAutoBuildClick,
  onNamesNumbersClick,
  onTidyCanvasClick,
  busy,
  hasItems,
  hasSelection,
  onDuplicateSelected,
  onDeleteSelected,
}) {
  const [dragActive, setDragActive] = useState(false);

  return (
    <aside className="gsb-left-panel">
      <button
        type="button"
        className="gsb-btn gsb-btn-primary gsb-btn-block"
        onClick={onAddImagesClick}
        disabled={busy}
      >
        + Add Images
      </button>

      <button
        type="button"
        className={`gsb-dropzone${dragActive ? " gsb-dropzone-active" : ""}`}
        onClick={onAddImagesClick}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files?.length) onFilesDropped(e.dataTransfer.files);
        }}
      >
        <p className="gsb-dropzone-hint">Drop images here or click upload</p>
        <p className="gsb-dropzone-formats">PNG, JPG, SVG, PDF</p>
      </button>

      <button
        type="button"
        className="gsb-btn gsb-btn-block"
        onClick={onNamesNumbersClick}
        disabled={busy}
      >
        Names &amp; Numbers
      </button>

      <div className="gsb-panel-heading">Smart layout</div>
      <button
        type="button"
        className="gsb-btn gsb-btn-primary gsb-btn-block"
        onClick={onAutoBuildClick}
        disabled={busy}
      >
        Auto Build
      </button>
      <button
        type="button"
        className="gsb-btn gsb-btn-block"
        onClick={onTidyCanvasClick}
        disabled={busy || !hasItems}
      >
        Tidy Canvas
      </button>

      <div className="gsb-panel-heading">Selection</div>
      <div className="gsb-selection-actions">
        <button
          type="button"
          className="gsb-btn"
          onClick={onDuplicateSelected}
          disabled={!hasSelection}
        >
          Duplicate
        </button>
        <button
          type="button"
          className="gsb-btn gsb-btn-danger"
          onClick={onDeleteSelected}
          disabled={!hasSelection}
        >
          Delete
        </button>
      </div>
    </aside>
  );
}
