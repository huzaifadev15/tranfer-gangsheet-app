import { useState } from "react";
import { TEMPLATE_CATEGORIES, findCategory } from "./templateCatalog";

// Two-level browse (categories → designs → preview), matching how a customer
// shops for ready-made artwork: pick a theme, then a design, then decide.
export default function TemplatesTab({ onAddTemplate, busy }) {
  const [categoryId, setCategoryId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const category = findCategory(categoryId);

  if (preview) {
    return (
      <div className="gsb-templates">
        <nav className="gsb-crumbs">
          <button type="button" className="gsb-link-btn" onClick={() => setPreview(null)}>
            ← Back to {category?.name ?? "templates"}
          </button>
        </nav>

        <div className="gsb-template-preview">
          {/* A missing file otherwise renders as an empty checkerboard, which
              reads as "transparent artwork" rather than "broken path". */}
          <img
            src={preview.src}
            alt={preview.label}
            onError={(e) => {
              e.currentTarget.style.display = "none";
              setLoadError(preview.src);
            }}
          />
          {loadError === preview.src && (
            <p className="gsb-modal-body">
              Couldn&apos;t load this template ({preview.src}). Check the file exists under
              public{preview.src}.
            </p>
          )}
        </div>

        <div className="gsb-template-preview-foot">
          <strong>{preview.label}</strong>
          <button
            type="button"
            className="gsb-btn gsb-btn-primary"
            disabled={busy}
            onClick={() => onAddTemplate(preview)}
          >
            {busy ? "Adding…" : "+ Add to gang sheet"}
          </button>
        </div>
      </div>
    );
  }

  if (category) {
    return (
      <div className="gsb-templates">
        <nav className="gsb-crumbs">
          <button type="button" className="gsb-link-btn" onClick={() => setCategoryId(null)}>
            Templates
          </button>
          <span aria-hidden="true">›</span>
          <strong>{category.name}</strong>
          <span className="gsb-crumbs-hint">Click a design to preview it</span>
        </nav>

        <div className="gsb-template-grid">
          {category.templates.map((template) => (
            <button
              key={template.id}
              type="button"
              className="gsb-template-card"
              onClick={() => setPreview(template)}
            >
              <span className="gsb-template-thumb">
                <img src={template.src} alt="" loading="lazy" />
              </span>
              <span className="gsb-template-name">{template.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="gsb-templates">
      <div className="gsb-template-grid">
        {TEMPLATE_CATEGORIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="gsb-template-card"
            onClick={() => setCategoryId(entry.id)}
          >
            <span className="gsb-template-thumb">
              {entry.templates[0] && (
                <img src={entry.templates[0].src} alt="" loading="lazy" />
              )}
            </span>
            <span className="gsb-template-name">
              {entry.name}
              <em>
                {entry.templates.length} design{entry.templates.length === 1 ? "" : "s"}
              </em>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
