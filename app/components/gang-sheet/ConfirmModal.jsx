import { useEffect } from "react";

export default function ConfirmModal({
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="gsb-modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="gsb-modal gsb-modal-narrow"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="gsb-modal-title">{title}</h2>
        <p className="gsb-modal-body">{body}</p>
        <div className="gsb-modal-actions">
          <button type="button" className="gsb-btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`gsb-btn ${destructive ? "gsb-btn-destructive" : "gsb-btn-primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
