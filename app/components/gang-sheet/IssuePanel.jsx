import { useState } from "react";

export default function IssuePanel({
  overlaps,
  outOfBounds,
  onTidy,
  onAllowOverlaps,
  suggestedFt,
  onGrowSheet,
}) {
  const [minimized, setMinimized] = useState(false);

  const hasOverlaps = overlaps.length > 0;
  const hasOutOfBounds = outOfBounds.length > 0;
  if (!hasOverlaps && !hasOutOfBounds) return null;

  if (minimized) {
    return (
      <button
        type="button"
        className="gsb-issue-pill"
        onClick={() => setMinimized(false)}
      >
        {overlaps.length + outOfBounds.length} layout issue
        {overlaps.length + outOfBounds.length === 1 ? "" : "s"}
      </button>
    );
  }

  return (
    <div className="gsb-issue-panel" role="status">
      {hasOverlaps && (
        <div className="gsb-issue">
          <div className="gsb-issue-head">
            <strong>Overlapping Images</strong>
            <span>
              · {overlaps.length} image{overlaps.length === 1 ? "" : "s"} overlapping or too
              close
            </span>
          </div>
          <ul className="gsb-issue-list">
            {overlaps.map((item) => (
              <li key={item.id}>{item.label}</li>
            ))}
          </ul>
        </div>
      )}

      {hasOutOfBounds && (
        <div className="gsb-issue">
          <div className="gsb-issue-head">
            <strong>Outside the printable area</strong>
            <span>
              · {outOfBounds.length} image{outOfBounds.length === 1 ? "" : "s"} past the sheet
              edge
            </span>
          </div>
          <ul className="gsb-issue-list">
            {outOfBounds.map((item) => (
              <li key={item.id}>{item.label}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="gsb-issue-actions">
        <button type="button" className="gsb-btn gsb-btn-small" onClick={onTidy}>
          Tidy Canvas
        </button>
        {suggestedFt != null && (
          <button
            type="button"
            className="gsb-btn gsb-btn-small gsb-btn-primary"
            onClick={() => onGrowSheet(suggestedFt)}
          >
            Increase to {suggestedFt} ft
          </button>
        )}
        {hasOverlaps && (
          <button
            type="button"
            className="gsb-btn gsb-btn-small"
            onClick={onAllowOverlaps}
          >
            Allow Overlaps
          </button>
        )}
        <button
          type="button"
          className="gsb-btn gsb-btn-small"
          onClick={() => setMinimized(true)}
        >
          Minimize
        </button>
      </div>
    </div>
  );
}
