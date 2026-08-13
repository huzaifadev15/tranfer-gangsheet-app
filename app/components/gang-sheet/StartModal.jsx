import { useEffect } from "react";
import Icon from "./Icon";

// Shown once when a customer first lands on an empty builder, to point them at
// a starting route. Previously this lived as a permanent overlay pinned to the
// middle of the canvas, which kept covering the sheet while people worked.
export default function StartModal({
  onAutoBuild,
  onManualBuild,
  onNamesNumbers,
  onClose,
}) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const options = [
    {
      icon: "wand",
      title: "Auto Build",
      hint: "Add images in bulk",
      onClick: onAutoBuild,
    },
    {
      icon: "plus",
      title: "Manual Build",
      hint: "Add images one at a time",
      onClick: onManualBuild,
    },
    {
      icon: "text",
      title: "Names & Numbers",
      hint: "Generate text rosters",
      onClick: onNamesNumbers,
    },
  ];

  return (
    <div className="gsb-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="gsb-modal gsb-start-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Start building your gang sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="gsb-modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>

        <h2 className="gsb-modal-title">Start Building Your Gang Sheet</h2>
        <p className="gsb-modal-body">
          Upload your designs and we&apos;ll arrange them efficiently.
        </p>

        <div className="gsb-start-options">
          {options.map((option) => (
            <button
              key={option.title}
              type="button"
              className="gsb-start-option"
              onClick={() => {
                onClose();
                option.onClick?.();
              }}
            >
              <Icon name={option.icon} />
              <strong>{option.title}</strong>
              <span>{option.hint}</span>
            </button>
          ))}
        </div>

        <button type="button" className="gsb-link-btn gsb-start-skip" onClick={onClose}>
          I&apos;ll start on my own
        </button>
      </div>
    </div>
  );
}
