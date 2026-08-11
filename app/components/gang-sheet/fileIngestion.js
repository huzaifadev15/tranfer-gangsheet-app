// Client-only file ingestion pipeline: validate an upload, then load it into
// a normalized { kind, dataUrl|svgString, widthIn, heightIn, label } shape
// that useFabricCanvas can turn into a canvas object. Never imported/called
// during SSR — only from browser event handlers.
import { sourcePxToIn, SHEET_WIDTH_IN } from "./units";

const ACCEPTED_MIME_KINDS = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
};

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

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

// Artwork is sized at its true print dimensions (pixels ÷ 300dpi), then
// scaled down only if it would overflow the sheet width.
function normalizeToInitialSize(widthPx, heightPx) {
  let widthIn = sourcePxToIn(widthPx || 1);
  let heightIn = sourcePxToIn(heightPx || 1);

  const maxWidthIn = SHEET_WIDTH_IN - 0.5;
  if (widthIn > maxWidthIn) {
    const scale = maxWidthIn / widthIn;
    widthIn *= scale;
    heightIn *= scale;
  }

  return { widthIn, heightIn };
}

async function loadRasterImage(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const { widthPx, heightPx } = await getImagePixelSize(dataUrl);
  const { widthIn, heightIn } = normalizeToInitialSize(widthPx, heightPx);
  return {
    kind: "image",
    dataUrl,
    thumbUrl: dataUrl,
    widthIn,
    heightIn,
    widthPx,
    heightPx,
    label: file.name,
  };
}

async function loadSvg(file) {
  const svgString = await readFileAsText(file);
  const { widthPx, heightPx } = getSvgIntrinsicSize(svgString);
  const { widthIn, heightIn } = normalizeToInitialSize(widthPx, heightPx);
  // Vector art has no fixed resolution, so the tray shows it without a
  // low-resolution warning; the thumbnail is the SVG source itself.
  return {
    kind: "svg",
    svgString,
    thumbUrl: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgString)))}`,
    widthIn,
    heightIn,
    widthPx,
    heightPx,
    vector: true,
    label: file.name,
  };
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
  return {
    kind: "image",
    dataUrl,
    thumbUrl: dataUrl,
    widthIn,
    heightIn,
    widthPx: canvas.width,
    heightPx: canvas.height,
    label: file.name,
  };
}

// Loads a template from the app's own /public folder into the same normalized
// shape an upload produces. The bitmap is re-encoded to PNG rather than kept
// as its source format (AVIF/WEBP): Fabric serializes the object to a data URL
// when a draft is saved, and the pixel tools all round-trip through PNG.
export async function ingestImageUrl(src, label) {
  const element = await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load template "${label}".`));
    img.src = src;
  });

  const widthPx = element.naturalWidth;
  const heightPx = element.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  canvas.getContext("2d").drawImage(element, 0, 0);

  const dataUrl = canvas.toDataURL("image/png");
  const { widthIn, heightIn } = normalizeToInitialSize(widthPx, heightPx);

  return {
    kind: "image",
    dataUrl,
    thumbUrl: src,
    widthIn,
    heightIn,
    widthPx,
    heightPx,
    label,
  };
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
