import { useCallback, useEffect, useRef, useState } from "react";
import { inToPx, pxToIn } from "./units";
import { packShelf } from "./binPacking";

const CUSTOM_PROPS = ["data"];
const MIN_ZOOM_PCT = 10;
const MAX_ZOOM_PCT = 400;
const ZOOM_STEP_PCT = 25;

function makeId() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Effective print resolution at the object's current on-sheet size — this is
// what changes as the customer scales artwork up, and what decides whether it
// prints sharp.
function effectiveDpi(obj, widthIn) {
  if (obj.data?.vector) return null;
  const srcPx = obj.data?.widthPx;
  if (!srcPx || !widthIn) return null;
  return Math.round(srcPx / widthIn);
}

// Hard-constrains an object to the printable area: artwork bigger than the
// sheet is scaled down to fit, then nudged back inside if any edge escapes.
// Applied live during drag/scale/rotate so nothing can ever be left outside.
function constrainToSheet(obj, maxWpx, maxHpx) {
  let box = obj.getBoundingRect();

  if (box.width > maxWpx || box.height > maxHpx) {
    const fit = Math.min(maxWpx / box.width, maxHpx / box.height);
    obj.scaleX *= fit;
    obj.scaleY *= fit;
    obj.setCoords();
    box = obj.getBoundingRect();
  }

  let dx = 0;
  let dy = 0;
  if (box.left < 0) dx = -box.left;
  else if (box.left + box.width > maxWpx) dx = maxWpx - (box.left + box.width);
  if (box.top < 0) dy = -box.top;
  else if (box.top + box.height > maxHpx) dy = maxHpx - (box.top + box.height);

  if (dx !== 0 || dy !== 0) {
    obj.left = (obj.left ?? 0) + dx;
    obj.top = (obj.top ?? 0) + dy;
    obj.setCoords();
  }
}

function describeObject(obj) {
  const widthIn = pxToIn(obj.getScaledWidth());
  const heightIn = pxToIn(obj.getScaledHeight());
  const box = obj.getBoundingRect();

  return {
    id: obj.data.id,
    kind: obj.data.kind,
    label: obj.data.label,
    widthIn,
    heightIn,
    xIn: pxToIn(obj.left ?? 0),
    yIn: pxToIn(obj.top ?? 0),
    // Rotation-aware hull, used for overlap/bounds checks and overlay placement.
    boxXIn: pxToIn(box.left),
    boxYIn: pxToIn(box.top),
    boxWIn: pxToIn(box.width),
    boxHIn: pxToIn(box.height),
    dpi: effectiveDpi(obj, widthIn),
    vector: Boolean(obj.data?.vector),
  };
}

function emitItems(canvas, cb) {
  if (!cb) return;
  const items = canvas
    .getObjects()
    .filter((obj) => obj.data?.id)
    .map(describeObject);
  cb(items);
}

// Owns the Fabric.js canvas lifecycle for the gang sheet editor. Geometry is
// tracked in inches (see units.js) and converted to px only at the Fabric
// boundary; canvas.setZoom() is a pure view transform on top of that.
export function useFabricCanvas({ canvasRef, sheetWidthIn, sheetHeightIn, onItemsChange }) {
  const fabricRef = useRef(null);
  const fabricLibRef = useRef(null);
  const onItemsChangeRef = useRef(onItemsChange);
  const [ready, setReady] = useState(false);
  const [zoomPct, setZoomPct] = useState(100);
  const [hasSelection, setHasSelection] = useState(false);
  const [selection, setSelection] = useState(null);

  const baseWidthPx = inToPx(sheetWidthIn);
  const baseHeightPx = inToPx(sheetHeightIn);

  // The canvas is created once, so its event handlers read the sheet size
  // through a ref rather than closing over a stale prop.
  const sheetPxRef = useRef({ w: baseWidthPx, h: baseHeightPx });

  useEffect(() => {
    onItemsChangeRef.current = onItemsChange;
  }, [onItemsChange]);

  useEffect(() => {
    sheetPxRef.current = { w: baseWidthPx, h: baseHeightPx };
  }, [baseWidthPx, baseHeightPx]);

  useEffect(() => {
    let disposed = false;
    let canvasInstance;

    (async () => {
      const fabric = await import("fabric");
      if (disposed || !canvasRef.current) return;
      fabricLibRef.current = fabric;

      canvasInstance = new fabric.Canvas(canvasRef.current, {
        selection: true,
        preserveObjectStacking: true,
        backgroundColor: "#ffffff",
      });
      canvasInstance.setDimensions({ width: baseWidthPx, height: baseHeightPx });
      fabricRef.current = canvasInstance;

      const emit = () => emitItems(canvasInstance, onItemsChangeRef.current);

      // Single objects get a live measurement/action overlay; multi-selects
      // don't (there's no one set of dimensions to report).
      const syncSelection = () => {
        const active = canvasInstance.getActiveObject();
        setHasSelection(Boolean(active));
        setSelection(active?.data?.id ? describeObject(active) : null);
      };

      // Keep the dragged/resized object inside the sheet on every frame of the
      // interaction, so it's impossible to release it outside the print area.
      const confine = (e) => {
        const target = e?.target;
        if (!target) return;
        const { w, h } = sheetPxRef.current;
        constrainToSheet(target, w, h);
        syncSelection();
      };

      canvasInstance.on("object:added", emit);
      canvasInstance.on("object:removed", emit);
      canvasInstance.on("object:modified", (e) => {
        confine(e);
        emit();
      });
      canvasInstance.on("object:moving", confine);
      canvasInstance.on("object:scaling", confine);
      canvasInstance.on("object:rotating", confine);
      canvasInstance.on("selection:created", syncSelection);
      canvasInstance.on("selection:updated", syncSelection);
      canvasInstance.on("selection:cleared", () => {
        setHasSelection(false);
        setSelection(null);
      });

      setReady(true);
    })();

    return () => {
      disposed = true;
      if (canvasInstance) {
        canvasInstance.dispose();
      }
      fabricRef.current = null;
      fabricLibRef.current = null;
    };
    // Canvas is created once; sheet size/zoom changes are applied imperatively below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyZoom = useCallback(
    (pct) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const clamped = Math.min(MAX_ZOOM_PCT, Math.max(MIN_ZOOM_PCT, Math.round(pct)));
      const zoom = clamped / 100;
      canvas.setDimensions({ width: baseWidthPx * zoom, height: baseHeightPx * zoom });
      canvas.setZoom(zoom);
      canvas.requestRenderAll();
      setZoomPct(clamped);
    },
    [baseWidthPx, baseHeightPx],
  );

  useEffect(() => {
    if (!ready) return;
    applyZoom(zoomPct);

    // Shortening the sheet can strand artwork past the new edge, so pull
    // everything back inside whenever the sheet is resized.
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.getObjects().forEach((obj) => {
      if (obj.data?.id) constrainToSheet(obj, baseWidthPx, baseHeightPx);
    });
    canvas.requestRenderAll();
    emitItems(canvas, onItemsChangeRef.current);
    // Re-apply current zoom whenever the sheet's logical size changes (e.g. length dropdown).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, baseWidthPx, baseHeightPx]);

  const zoomIn = useCallback(() => applyZoom(zoomPct + ZOOM_STEP_PCT), [applyZoom, zoomPct]);
  const zoomOut = useCallback(() => applyZoom(zoomPct - ZOOM_STEP_PCT), [applyZoom, zoomPct]);
  const zoomReset = useCallback(() => applyZoom(100), [applyZoom]);
  const zoomToFit = useCallback(
    // Sheet width is the fixed roll size, so "fit" matches it to the
    // viewport width and lets length scroll, rather than shrinking to fit
    // both dimensions (which left a wide gutter of unused width).
    (containerWidthPx) => {
      if (!containerWidthPx) return;
      const fitPct = Math.floor((containerWidthPx / baseWidthPx) * 100);
      applyZoom(Math.max(MIN_ZOOM_PCT, fitPct));
    },
    [applyZoom, baseWidthPx],
  );

  const addItem = useCallback(async (item, position) => {
    const canvas = fabricRef.current;
    const fabric = fabricLibRef.current;
    if (!canvas || !fabric) return null;

    const id = item.id ?? makeId();
    const widthPx = inToPx(item.widthIn);
    const heightPx = inToPx(item.heightIn);
    const xPx = inToPx(position?.xIn ?? 0.25);
    const yPx = inToPx(position?.yIn ?? 0.25);

    let obj;
    if (item.kind === "svg") {
      const { objects, options } = await fabric.loadSVGFromString(item.svgString);
      obj = fabric.util.groupSVGElements(objects.filter(Boolean), options);
    } else {
      obj = await fabric.FabricImage.fromURL(item.dataUrl, { crossOrigin: "anonymous" });
    }

    const scaleX = widthPx / (obj.width || widthPx);
    const scaleY = heightPx / (obj.height || heightPx);
    obj.set({
      left: xPx,
      top: yPx,
      scaleX,
      scaleY,
      data: {
        id,
        kind: item.kind,
        label: item.label,
        widthPx: item.widthPx,
        heightPx: item.heightPx,
        vector: Boolean(item.vector),
      },
    });

    obj.setCoords();
    constrainToSheet(obj, sheetPxRef.current.w, sheetPxRef.current.h);

    canvas.add(obj);
    canvas.setActiveObject(obj);
    canvas.requestRenderAll();
    return id;
  }, []);

  const addItems = useCallback(
    // `sheetHeightIn` lets a caller that is simultaneously growing the sheet
    // (Auto Build) declare the target height up front — otherwise placement
    // would be constrained against the pre-growth size still held in the ref.
    async (itemsWithPositions, options = {}) => {
      if (options.sheetHeightIn) {
        sheetPxRef.current = {
          ...sheetPxRef.current,
          h: Math.max(sheetPxRef.current.h, inToPx(options.sheetHeightIn)),
        };
      }
      for (const { item, position } of itemsWithPositions) {
        // Sequential: Fabric image decode is async and objects must land in a stable order.
        // eslint-disable-next-line no-await-in-loop
        await addItem(item, position);
      }
      fabricRef.current?.discardActiveObject();
      fabricRef.current?.requestRenderAll();
    },
    [addItem],
  );

  const removeSelected = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.getActiveObjects().forEach((obj) => canvas.remove(obj));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }, []);

  const duplicateSelected = useCallback(async () => {
    const canvas = fabricRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    const cloned = await active.clone();
    cloned.set({
      left: (active.left ?? 0) + 20,
      top: (active.top ?? 0) + 20,
      data: { ...active.data, id: makeId() },
    });
    canvas.add(cloned);
    canvas.setActiveObject(cloned);
    canvas.requestRenderAll();
  }, []);

  // Repacks everything currently on the sheet into a guaranteed
  // non-overlapping layout. Returns the length the result consumes so the
  // caller can grow the sheet if it no longer fits.
  const tidyCanvas = useCallback(
    (options = {}) => {
      const canvas = fabricRef.current;
      if (!canvas) return { usedHeightIn: 0 };

      const objects = canvas.getObjects().filter((obj) => obj.data?.id);
      // Pack by each object's rotated hull, not its unrotated width/height,
      // so a rotated design reserves the space it actually occupies.
      const items = objects.map((obj) => {
        const box = obj.getBoundingRect();
        return {
          id: obj.data.id,
          widthIn: pxToIn(box.width),
          heightIn: pxToIn(box.height),
          offsetXPx: (obj.left ?? 0) - box.left,
          offsetYPx: (obj.top ?? 0) - box.top,
        };
      });

      const { placements, usedHeightIn } = packShelf(items, sheetWidthIn, options);
      const byId = new Map(placements.map((p) => [p.id, p]));
      const offsets = new Map(items.map((i) => [i.id, i]));

      objects.forEach((obj) => {
        const placement = byId.get(obj.data.id);
        if (!placement) return;
        const offset = offsets.get(obj.data.id);
        // Placement positions the hull, so re-apply the object's own offset
        // from its hull origin.
        obj.set({
          left: inToPx(placement.xIn) + offset.offsetXPx,
          top: inToPx(placement.yIn) + offset.offsetYPx,
        });
        obj.setCoords();
      });

      canvas.requestRenderAll();
      emitItems(canvas, onItemsChangeRef.current);
      return { usedHeightIn };
    },
    [sheetWidthIn],
  );

  const exportState = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return null;
    return canvas.toJSON(CUSTOM_PROPS);
  }, []);

  const importState = useCallback(async (json) => {
    const canvas = fabricRef.current;
    if (!canvas || !json) return;
    await canvas.loadFromJSON(json);
    canvas.requestRenderAll();
    emitItems(canvas, onItemsChangeRef.current);
  }, []);

  return {
    ready,
    zoomPct,
    hasSelection,
    selection,
    zoomIn,
    zoomOut,
    zoomReset,
    zoomToFit,
    addItem,
    addItems,
    removeSelected,
    duplicateSelected,
    tidyCanvas,
    exportState,
    importState,
  };
}

export { packShelf };
