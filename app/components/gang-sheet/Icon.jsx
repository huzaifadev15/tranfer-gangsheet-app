// Single-stroke 24x24 line icons, sized by the button's font-size via `em` so
// they optically match their label without per-site tuning. Purely decorative —
// every call site already has a text label or aria-label.
const PATHS = {
  text: "M4 6V4h16v2M12 4v16M8 20h8",
  plus: "M12 5v14M5 12h14",
  image: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6",
  wand: "M15 4V2M15 10V8M11 6H9M21 6h-2M17.8 8.8l1.4 1.4M17.8 3.2l1.4-1.4M12.2 8.8l-1.4 1.4M3 21l9-9",
  broom: "M19 5l-7 7M8 21l-4-4 5-5 4 4zM11 12l5 5",
  save: "M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-7h8v7",
  cart: "M3 4h2l2.4 11.2a2 2 0 002 1.6h7.8a2 2 0 002-1.6L21 8H6M9 21a1 1 0 100-2 1 1 0 000 2zM18 21a1 1 0 100-2 1 1 0 000 2z",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-4",
  redo: "M15 14l5-5-5-5M20 9H10a6 6 0 100 12h4",
  zoomIn: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3M11 8v6M8 11h6",
  zoomOut: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3M8 11h6",
  fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  back: "M15 19l-7-7 7-7",
};

export default function Icon({ name, className = "" }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg
      className={`gsb-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}
