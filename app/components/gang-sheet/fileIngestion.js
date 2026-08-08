// Client-only file ingestion pipeline: validate an upload, then load it into
// a normalized { kind, dataUrl|svgString, widthIn, heightIn, label } shape
// that useFabricCanvas can turn into a canvas object. Never imported/called
// during SSR — only from browser event handlers.

const ACCEPTED_MIME_KINDS = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
};

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const DEFAULT_LONG_SIDE_IN = 4;

function inferKindFromExtension(name) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "png" || ext === "jpg" || ext === "jpeg") return "image";
  if (ext === "svg") return "svg";
  if (ext === "pdf") return "pdf";
  return null;
}

export function validateFile(file) {
  const kind = ACCEPTED_MIME_KINDS[file.type] ?? inferKindFromExtension(file.name);
  if (!kind) {
    return {
      ok: false,
      reason: `"${file.name}" isn't supported. Upload PNG, JPG, SVG, or PDF.`,
    };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, reason: `"${file.name}" is larger than 25MB.` };
  }
  return { ok: true, kind };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function getImagePixelSize(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ widthPx: img.naturalWidth, heightPx: img.naturalHeight });
    img.onerror = () => reject(new Error("Could not read image dimensions."));
    img.src = dataUrl;
  });
}

function getSvgIntrinsicSize(svgString) {
  const doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
  const svgEl = doc.documentElement;
  const widthAttr = parseFloat(svgEl.getAttribute("width"));
  const heightAttr = parseFloat(svgEl.getAttribute("height"));
  if (widthAttr > 0 && heightAttr > 0) {
    return { widthPx: widthAttr, heightPx: heightAttr };
  }
  const viewBox = svgEl.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox.trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { widthPx: parts[2], heightPx: parts[3] };
    }
  }
  return { widthPx: 200, heightPx: 200 };
}

// Real-world DPI of an arbitrary upload is unknowable, so new items start at
// a sane physical size (longer side = 4in) and the customer resizes from
// there, rather than guessing a DPI and getting it wrong.
function normalizeToInitialSize(widthPx, heightPx, targetLongSideIn = DEFAULT_LONG_SIDE_IN) {
  const longSidePx = Math.max(widthPx, heightPx) || 1;
  const scale = targetLongSideIn / longSidePx;
  return { widthIn: widthPx * scale, heightIn: heightPx * scale };
}

async function loadRasterImage(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const { widthPx, heightPx } = await getImagePixelSize(dataUrl);
  const { widthIn, heightIn } = normalizeToInitialSize(widthPx, heightPx);
  return { kind: "image", dataUrl, widthIn, heightIn, label: file.name };
}

async function loadSvg(file) {
  const svgString = await readFileAsText(file);
  const { widthPx, heightPx } = getSvgIntrinsicSize(svgString);
  const { widthIn, heightIn } = normalizeToInitialSize(widthPx, heightPx);
  return { kind: "svg", svgString, widthIn, heightIn, label: file.name };
}

async function rasterizePdfFirstPage(file) {
  const [pdfjsLib, workerUrlModule] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.mjs?url"),
  ]);
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrlModule.default;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  const RENDER_SCALE = 150 / 72; // ~150dpi raster
  const viewport = page.getViewport({ scale: RENDER_SCALE });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");

  await page.render({ canvasContext: ctx, viewport }).promise;
  await pdf.destroy();

  const dataUrl = canvas.toDataURL("image/png");
  const { widthIn, heightIn } = normalizeToInitialSize(canvas.width, canvas.height);
  return { kind: "image", dataUrl, widthIn, heightIn, label: file.name };
}

export async function ingestFile(file) {
  const validation = validateFile(file);
  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  switch (validation.kind) {
    case "image":
      return loadRasterImage(file);
    case "svg":
      return loadSvg(file);
    case "pdf":
      return rasterizePdfFirstPage(file);
    default:
      throw new Error("Unsupported file type.");
  }
}
