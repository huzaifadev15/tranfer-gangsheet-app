// Client-side pixel operations for the Image Options panel. Everything here
// runs on a detached 2D canvas over the artwork's own decoded bitmap — no
// upload, no third-party service, so it works the same on a storefront page
// as it does offline.

function toCanvas(element) {
  const width = element.naturalWidth || element.width;
  const height = element.naturalHeight || element.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(element, 0, 0, width, height);
  return { canvas, ctx, width, height };
}

function readPixels(ctx, width, height) {
  try {
    return ctx.getImageData(0, 0, width, height);
  } catch {
    // Cross-origin source taints the canvas and blocks pixel reads.
    return null;
  }
}

export function hexToRgb(hex) {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

// Squared distance keeps the per-pixel loop free of Math.sqrt; callers compare
// against a squared tolerance.
function distanceSq(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}

// The dominant colours in the artwork, for the Replace Colors swatch row.
// Colours are bucketed before counting so anti-aliased edges collapse into the
// solid colour they belong to instead of flooding the list with near-dupes.
export function extractPalette(element, maxColors = 6) {
  const { ctx, width, height } = toCanvas(element);
  const pixels = readPixels(ctx, width, height);
  if (!pixels) return [];

  const { data } = pixels;
  const buckets = new Map();
  const BUCKET = 24;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const key =
      Math.round(data[i] / BUCKET) * 1e6 +
      Math.round(data[i + 1] / BUCKET) * 1e3 +
      Math.round(data[i + 2] / BUCKET);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
      bucket.r += data[i];
      bucket.g += data[i + 1];
      bucket.b += data[i + 2];
    } else {
      buckets.set(key, { count: 1, r: data[i], g: data[i + 1], b: data[i + 2] });
    }
  }

  return [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, maxColors)
    .map((bucket) =>
      rgbToHex(
        Math.round(bucket.r / bucket.count),
        Math.round(bucket.g / bucket.count),
        Math.round(bucket.b / bucket.count),
      ),
    );
}

// Swaps one colour family for another. Pixels within `tolerance` of the source
// are re-tinted while keeping their original alpha, so anti-aliased edges stay
// smooth rather than turning into a hard jagged mask.
export function replaceColors(element, replacements, tolerance = 48) {
  const { canvas, ctx, width, height } = toCanvas(element);
  const pixels = readPixels(ctx, width, height);
  if (!pixels || replacements.length === 0) return null;

  const { data } = pixels;
  const rules = replacements.map(({ from, to }) => ({
    from: hexToRgb(from),
    to: hexToRgb(to),
  }));
  const toleranceSq = tolerance * tolerance * 3;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    for (const rule of rules) {
      if (
        distanceSq(data[i], data[i + 1], data[i + 2], rule.from.r, rule.from.g, rule.from.b) <=
        toleranceSq
      ) {
        data[i] = rule.to.r;
        data[i + 1] = rule.to.g;
        data[i + 2] = rule.to.b;
        break;
      }
    }
  }

  ctx.putImageData(pixels, 0, 0);
  return { dataUrl: canvas.toDataURL("image/png"), widthPx: width, heightPx: height };
}

// Knocks out a flat background by flood-filling inward from the edges. This
// deliberately starts at the border rather than keying the whole image, so a
// colour that also appears inside the artwork (white in a logo's highlights)
// survives as long as it isn't connected to the edge.
export function removeBackground(element, tolerance = 32) {
  const { canvas, ctx, width, height } = toCanvas(element);
  const pixels = readPixels(ctx, width, height);
  if (!pixels) return null;

  const { data } = pixels;
  const idx = (x, y) => (y * width + x) * 4;

  // Seed colour = the most common of the four corners, which is what a flat
  // backdrop looks like even when one corner happens to hold artwork.
  const corners = [
    idx(0, 0),
    idx(width - 1, 0),
    idx(0, height - 1),
    idx(width - 1, height - 1),
  ];
  const tally = new Map();
  corners.forEach((c) => {
    const key = `${data[c]},${data[c + 1]},${data[c + 2]}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  });
  const [seedKey] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  const [sr, sg, sb] = seedKey.split(",").map(Number);

  const toleranceSq = tolerance * tolerance * 3;
  const visited = new Uint8Array(width * height);
  const stack = [];

  for (let x = 0; x < width; x += 1) {
    stack.push([x, 0], [x, height - 1]);
  }
  for (let y = 0; y < height; y += 1) {
    stack.push([0, y], [width - 1, y]);
  }

  let cleared = 0;
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const flat = y * width + x;
    if (visited[flat]) continue;
    visited[flat] = 1;

    const p = flat * 4;
    if (data[p + 3] === 0) {
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      continue;
    }
    if (distanceSq(data[p], data[p + 1], data[p + 2], sr, sg, sb) > toleranceSq) continue;

    data[p + 3] = 0;
    cleared += 1;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  if (cleared === 0) return null;

  ctx.putImageData(pixels, 0, 0);
  return { dataUrl: canvas.toDataURL("image/png"), widthPx: width, heightPx: height };
}
