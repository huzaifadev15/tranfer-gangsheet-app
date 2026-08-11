// Ready-made designs offered in the Add Images → Templates tab.
//
// The editor is served through Shopify's App Proxy, so the page's origin is
// the *storefront* (shop.myshopify.com), not the app's Vercel domain. Only
// paths under the proxy subpath reach the app, which is why the artwork lives
// at public/apps/gang-sheet-builder/templates rather than public/templates —
// a bare "/templates/..." URL resolves against the storefront and 404s.
//
// Keeping them proxied also keeps them same-origin, which is required: these
// bitmaps go through the same canvas pipeline as uploads (Auto Crop & Trim,
// Remove BG, Recolor), and a cross-origin image would taint the canvas and
// block every one of those pixel reads.
//
// To add a design: drop the file in public/apps/gang-sheet-builder/templates
// and add an entry below.

// Must match [app_proxy] prefix + subpath in shopify.app.toml.
const TEMPLATE_BASE = "/apps/gang-sheet-builder/templates";

export const TEMPLATE_CATEGORIES = [
  {
    id: "outdoors",
    name: "Outdoors",
    templates: [{ id: "template-9", label: "Adventure Awaits", src: `${TEMPLATE_BASE}/template-9.avif` }],
  },
  {
    id: "fitness",
    name: "Fitness",
    templates: [{ id: "template-5", label: "Gym Is Life", src: `${TEMPLATE_BASE}/template-5.avif` }],
  },
  {
    id: "general",
    name: "All Designs",
    // TODO: split these into real categories and give them selling names —
    // the label shown here is what the customer reads in the gallery.
    templates: [
      { id: "template-1", label: "Design 1", src: `${TEMPLATE_BASE}/template-1.avif` },
      { id: "template-2", label: "Design 2", src: `${TEMPLATE_BASE}/template-2.avif` },
      { id: "template-3", label: "Design 3", src: `${TEMPLATE_BASE}/template-3.avif` },
      { id: "template-6", label: "Design 6", src: `${TEMPLATE_BASE}/template-6.avif` },
      { id: "template-7", label: "Design 7", src: `${TEMPLATE_BASE}/template-7.avif` },
      { id: "template-10", label: "Design 10", src: `${TEMPLATE_BASE}/template-10.avif` },
    ],
  },
];

export function findCategory(id) {
  return TEMPLATE_CATEGORIES.find((category) => category.id === id) ?? null;
}
