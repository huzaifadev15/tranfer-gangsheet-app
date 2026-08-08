import { useRef, useState } from "react";

const ACCEPT =
  "image/png,image/jpeg,image/svg+xml,application/pdf,.png,.jpg,.jpeg,.svg,.pdf";

export default function UploadModal({ onClose, onFiles, progress }) {
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  const uploading = Boolean(progress);
  const pct = uploading && progress.total
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <div className="gsb-modal-overlay" role="dialog" aria-modal="true" aria-label="Add images">
      <div className="gsb-modal gsb-modal-wide">
        <div className="gsb-modal-header">
          <div>
            <h2>Add Images</h2>
            <p className="gsb-modal-hint">
              Upload your artwork. Files are sized at 300 DPI for print.
            </p>
          </div>
          <button
            type="button"
            className="gsb-icon-btn"
            onClick={onClose}
            aria-label="Close"
            disabled={uploading}
          >
            ×
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) onFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {uploading ? (
          <div className="gsb-upload-progress">
            <div className="gsb-upload-progress-head">
              <strong>Processing files</strong>
              <span>
                {progress.done} of {progress.total}
              </span>
            </div>
            <div
              className="gsb-progress-track"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="gsb-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="gsb-upload-progress-foot">
              <span>{progress.current || ""}</span>
              <span>{pct}%</span>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={`gsb-dropzone gsb-dropzone-lg${dragActive ? " gsb-dropzone-active" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
            }}
          >
            <p className="gsb-dropzone-hint">Drag &amp; drop images here</p>
            <span className="gsb-btn gsb-btn-primary gsb-dropzone-cta">Browse Files</span>
            <p className="gsb-dropzone-formats">PNG, JPG, SVG, PDF</p>
          </button>
        )}
      </div>
    </div>
  );
}
