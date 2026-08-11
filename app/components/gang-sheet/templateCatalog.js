// Ready-made designs offered in the Add Images → Templates tab.
//
// Artwork lives in /public/templates and is served from the app's own origin,
// which matters: template bitmaps go through the same canvas pipeline as
// uploads (Auto Crop & Trim, Remove BG, Recolor), and a cross-origin image
// would taint the canvas and block every one of those reads.
//
// To add a design: drop the file in public/templates and add an entry here.
// No code changes and no redeploy of the editor itself are needed.

export const TEMPLATE_CATEGORIES = [
  {
    id: "outdoors",
    name: "Outdoors",
    templates: [{ id: "template-9", label: "Adventure Awaits", src: "/templates/template-9.avif" }],
  },
  {
    id: "fitness",
    name: "Fitness",
    templates: [{ id: "template-5", label: "Gym Is Life", src: "/templates/template-5.avif" }],
  },
  {
    id: "general",
    name: "All Designs",
    // TODO: split these into real categories and give them selling names —
    // the label shown here is what the customer reads in the gallery.
    templates: [
      { id: "template-1", label: "Design 1", src: "/templates/template-1.avif" },
      { id: "template-2", label: "Design 2", src: "/templates/template-2.avif" },
      { id: "template-3", label: "Design 3", src: "/templates/template-3.avif" },
      { id: "template-6", label: "Design 6", src: "/templates/template-6.avif" },
      { id: "template-7", label: "Design 7", src: "/templates/template-7.avif" },
      { id: "template-10", label: "Design 10", src: "/templates/template-10.avif" },
    ],
  },
];

export function findCategory(id) {
  return TEMPLATE_CATEGORIES.find((category) => category.id === id) ?? null;
}
