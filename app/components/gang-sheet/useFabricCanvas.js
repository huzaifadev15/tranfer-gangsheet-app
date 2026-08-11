import { useCallback, useEffect, useRef, useState } from "react";
import { inToPx, pxToIn } from "./units";
import { packShelf } from "./binPacking";

const CUSTOM_PROPS = ["data"];
const MIN_ZOOM_PCT = 10;
const MAX_ZOOM_PCT = 400;
const ZOOM_STEP_PCT = 25;
const MAX_HISTORY = 50;
const MIN_SIZE_IN = 0.25;
const SNAP_STEP_IN = 0.25;

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
    thumbUrl: obj.data.thumbUrl ?? null,
    angle: Math.round(obj.angle ?? 0),
    flipX: Boolean(obj.flipX),
    flipY: Boolean(obj.flipY),
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
export function useFabricCanvas({
  canvasRef,
  sheetWidthIn,
  sheetHeightIn,
  onItemsChange,
  showImageBorders = false,
  imageSnapping = false,
}) {
  const fabricRef = useRef(null);
  const fabricLibRef = useRef(null);
  const onItemsChangeRef = useRef(onItemsChange);
  const [ready, setReady] = useState(false);
  const [zoomPct, setZoomPct] = useState(100);
  const [hasSelection, setHasSelection] = useState(false);
  const [selection, setSelection] = useState(null);

  // Undo/redo keeps whole-canvas snapshots rather than inverse operations:
  // Fabric mutations are spread across drag/scale/rotate handlers, and a
  // snapshot is the only representation guaranteed to round-trip all of them.
  const historyRef = useRef({ past: [], future: [], present: null, lock: false });
  const commitRef = useRef(() => {});

  // Read inside canvas event handlers, which are bound once and would
  // otherwise close over the first render's values.
  const bordersRef = useRef(showImageBorders);
  const snappingRef = useRef(imageSnapping);
  useEffect(() => {
    bordersRef.current = showImageBorders;
    fabricRef.current?.requestRenderAll();
  }, [showImageBorders]);
  useEffect(() => {
    snappingRef.current = imageSnapping;
  }, [imageSnapping]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

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

      // Batch operations (Auto Build, Tidy, draft restore) hold the lock and
      // commit once, so one user action costs one undo step rather than one
      // per object touched.
      const commit = () => {
        const history = historyRef.current;
        if (history.lock) return;
        if (history.present) history.past.push(history.present);
        if (history.past.length > MAX_HISTORY) history.past.shift();
        history.present = canvasInstance.toJSON(CUSTOM_PROPS);
        history.future = [];
        setCanUndo(history.past.length > 0);
        setCanRedo(false);
      };
      commitRef.current = commit;
      historyRef.current.present = canvasInstance.toJSON(CUSTOM_PROPS);

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
        if (snappingRef.current) {
          // Quarter-inch grid — fine enough to nudge freely, coarse enough
          // that neighbouring designs line up on a shared edge.
          const step = inToPx(SNAP_STEP_IN);
          target.set({
            left: Math.round((target.left ?? 0) / step) * step,
            top: Math.round((target.top ?? 0) / step) * step,
          });
        }
        const { w, h } = sheetPxRef.current;
        constrainToSheet(target, w, h);
        syncSelection();
      };

      // Ninja draws a hairline box around every placed design so gaps are
      // visible against transparent artwork. Painted after the scene rather
      // than as an object stroke, which would alter the artwork itself.
      canvasInstance.on("after:render", () => {
        if (!bordersRef.current) return;
        const ctx = canvasInstance.getContext();
        const zoom = canvasInstance.getZoom();
        ctx.save();
        ctx.strokeStyle = "#e07a1f";
        ctx.lineWidth = 1;
        canvasInstance.getObjects().forEach((obj) => {
          if (!obj.data?.id) return;
          const box = obj.getBoundingRect();
          ctx.strokeRect(box.left * zoom, box.top * zoom, box.width * zoom, box.height * zoom);
        });
        ctx.restore();
      });

      canvasInstance.on("object:added", () => {
        emit();
        commit();
      });
      canvasInstance.on("object:removed", () => {
        emit();
        commit();
      });
      canvasInstance.on("object:modified", (e) => {
        confine(e);
        emit();
        commit();
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
        thumbUrl: item.thumbUrl ?? null,
        widthPx: item.widthPx,
        heightPx: item.heightPx,
        // Remembered so "Reset" can restore the artwork's true print size
        // after any amount of manual scaling.
        naturalWidthIn: item.widthIn,
        naturalHeightIn: item.heightIn,
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
      // One batch = one undo step, rather than one per placed image.
      historyRef.current.lock = true;
      try {
        for (const { item, position } of itemsWithPositions) {
          // Sequential: Fabric image decode is async and objects must land in a stable order.
          // eslint-disable-next-line no-await-in-loop
          await addItem(item, position);
        }
      } finally {
        historyRef.current.lock = false;
      }
      fabricRef.current?.discardActiveObject();
      fabricRef.current?.requestRenderAll();
      commitRef.current();
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

  // Pushes canvas state back into React after an imperative edit that didn't
  // originate from a Fabric pointer interaction.
  const refresh = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject();
    setHasSelection(Boolean(active));
    setSelection(active?.data?.id ? describeObject(active) : null);
    emitItems(canvas, onItemsChangeRef.current);
  }, []);

  // Applies `mutate` to the active object, then re-confines, re-renders and
  // records a single history step — the shape every Image Options action takes.
  const editActive = useCallback(
    (mutate) => {
      const canvas = fabricRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !active?.data?.id) return;
      mutate(active, canvas);
      active.setCoords();
      constrainToSheet(active, sheetPxRef.current.w, sheetPxRef.current.h);
      canvas.requestRenderAll();
      refresh();
      commitRef.current();
    },
    [refresh],
  );

  const restoreSnapshot = useCallback(
    async (state) => {
      const canvas = fabricRef.current;
      if (!canvas || !state) return;
      const history = historyRef.current;
      history.lock = true;
      await canvas.loadFromJSON(state);
      canvas.requestRenderAll();
      history.lock = false;
      refresh();
      setCanUndo(history.past.length > 0);
      setCanRedo(history.future.length > 0);
    },
    [refresh],
  );

  const undo = useCallback(async () => {
    const history = historyRef.current;
    if (history.past.length === 0) return;
    history.future.push(history.present);
    history.present = history.past.pop();
    await restoreSnapshot(history.present);
  }, [restoreSnapshot]);

  const redo = useCallback(async () => {
    const history = historyRef.current;
    if (history.future.length === 0) return;
    history.past.push(history.present);
    history.present = history.future.pop();
    await restoreSnapshot(history.present);
  }, [restoreSnapshot]);

  const selectById = useCallback(
    (id) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const target = canvas.getObjects().find((obj) => obj.data?.id === id);
      if (!target) return;
      canvas.setActiveObject(target);
      canvas.requestRenderAll();
      refresh();
    },
    [refresh],
  );

  const removeById = useCallback(
    (id) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const target = canvas.getObjects().find((obj) => obj.data?.id === id);
      if (!target) return;
      canvas.remove(target);
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      refresh();
    },
    [refresh],
  );

  // Width/height are authored in inches in the Image Options panel; Fabric
  // only understands scale factors, so convert against the object's
  // *unscaled* size rather than its current on-sheet size.
  const setSelectionSize = useCallback(
    ({ widthIn, heightIn }) => {
      editActive((obj) => {
        if (widthIn != null && obj.width) {
          obj.scaleX = inToPx(Math.max(MIN_SIZE_IN, widthIn)) / obj.width;
        }
        if (heightIn != null && obj.height) {
          obj.scaleY = inToPx(Math.max(MIN_SIZE_IN, heightIn)) / obj.height;
        }
      });
    },
    [editActive],
  );

  const rotateSelected = useCallback(
    (deltaDeg = 90) => {
      editActive((obj) => {
        obj.rotate(((obj.angle ?? 0) + deltaDeg) % 360);
      });
    },
    [editActive],
  );

  const flipSelected = useCallback(
    (axis) => {
      editActive((obj) => {
        if (axis === "y") obj.set({ flipY: !obj.flipY });
        else obj.set({ flipX: !obj.flipX });
      });
    },
    [editActive],
  );

  const centerSelected = useCallback(() => {
    editActive((obj, canvas) => {
      const box = obj.getBoundingRect();
      const targetLeft = (sheetPxRef.current.w - box.width) / 2;
      obj.set({ left: (obj.left ?? 0) + (targetLeft - box.left) });
      canvas.requestRenderAll();
    });
  }, [editActive]);

  // Back to the artwork's true print size (pixels ÷ source DPI), un-rotated
  // and un-flipped — the "Reset" escape hatch after manual scaling.
  const resetSelected = useCallback(() => {
    editActive((obj) => {
      const naturalWidthIn = obj.data?.naturalWidthIn;
      const naturalHeightIn = obj.data?.naturalHeightIn;
      obj.set({ angle: 0, flipX: false, flipY: false });
      if (naturalWidthIn && obj.width) obj.scaleX = inToPx(naturalWidthIn) / obj.width;
      if (naturalHeightIn && obj.height) obj.scaleY = inToPx(naturalHeightIn) / obj.height;
    });
  }, [editActive]);

  // Crops fully-transparent margins off a raster object by scanning its source
  // alpha channel, then shifts the object so the visible artwork doesn't move.
  const autoTrimSelected = useCallback(() => {
    const canvas = fabricRef.current;
    const active = canvas?.getActiveObject();
    const element = active?.getElement?.();
    if (!canvas || !element || active.data?.vector) return { trimmed: false };

    const srcW = element.naturalWidth || element.width;
    const srcH = element.naturalHeight || element.height;
    if (!srcW || !srcH) return { trimmed: false };

    const scratch = document.createElement("canvas");
    scratch.width = srcW;
    scratch.height = srcH;
    const ctx = scratch.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(element, 0, 0);

    let data;
    try {
      data = ctx.getImageData(0, 0, srcW, srcH).data;
    } catch {
      // Tainted canvas (cross-origin source) — nothing we can read.
      return { trimmed: false };
    }

    let minX = srcW;
    let minY = srcH;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < srcH; y += 1) {
      for (let x = 0; x < srcW; x += 1) {
        if (data[(y * srcW + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return { trimmed: false };

    const cropX = (active.cropX ?? 0) + minX;
    const cropY = (active.cropY ?? 0) + minY;
    const newW = maxX - minX + 1;
    const newH = maxY - minY + 1;
    if (newW === active.width && newH === active.height) return { trimmed: false };

    const { scaleX, scaleY } = active;
    // Offset from the old visible origin to the new one, in object-local
    // space, mirrored when the object is flipped and then rotated into world
    // space so the artwork stays put on the sheet.
    const localDx = (active.flipX ? active.width - minX - newW : minX) * scaleX;
    const localDy = (active.flipY ? active.height - minY - newH : minY) * scaleY;
    const rad = ((active.angle ?? 0) * Math.PI) / 180;
    const worldDx = localDx * Math.cos(rad) - localDy * Math.sin(rad);
    const worldDy = localDx * Math.sin(rad) + localDy * Math.cos(rad);

    active.set({
      cropX,
      cropY,
      width: newW,
      height: newH,
      left: (active.left ?? 0) + worldDx,
      top: (active.top ?? 0) + worldDy,
      data: {
        ...active.data,
        // DPI is derived from source pixels over printed inches, so the
        // trimmed pixel count has to replace the original.
        widthPx: newW,
        heightPx: newH,
        trimmed: true,
      },
    });
    active.setCoords();
    constrainToSheet(active, sheetPxRef.current.w, sheetPxRef.current.h);
    canvas.requestRenderAll();
    refresh();
    commitRef.current();
    return { trimmed: true };
  }, [refresh]);

  // The decoded bitmap behind the selected object, for the pixel operations
  // in imageOps.js (Remove BG, Replace Colors).
  const getSelectionElement = useCallback(() => {
    const active = fabricRef.current?.getActiveObject();
    if (!active || active.data?.vector) return null;
    return active.getElement?.() ?? null;
  }, []);

  // Swaps in a processed bitmap while holding the object's *printed* size
  // fixed — the customer edited the artwork, not how big it prints.
  const applyProcessedImage = useCallback(
    async ({ dataUrl, widthPx, heightPx }) => {
      const canvas = fabricRef.current;
      const fabric = fabricLibRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !fabric || !active) return false;

      const printedWidthPx = active.getScaledWidth();
      const printedHeightPx = active.getScaledHeight();
      const element = await fabric.util.loadImage(dataUrl, { crossOrigin: "anonymous" });

      active.setElement(element);
      active.set({
        cropX: 0,
        cropY: 0,
        width: widthPx,
        height: heightPx,
        scaleX: printedWidthPx / widthPx,
        scaleY: printedHeightPx / heightPx,
        data: { ...active.data, widthPx, heightPx },
      });
      active.setCoords();
      canvas.requestRenderAll();
      refresh();
      commitRef.current();
      return true;
    },
    [refresh],
  );

  const clearAll = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    historyRef.current.lock = true;
    canvas.getObjects().forEach((obj) => canvas.remove(obj));
    canvas.discardActiveObject();
    historyRef.current.lock = false;
    canvas.requestRenderAll();
    refresh();
    commitRef.current();
  }, [refresh]);

  // The pan tool has to take objects out of the hit-test path, otherwise a
  // drag that starts on artwork moves the artwork instead of the view.
  const setToolMode = useCallback((mode) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const interactive = mode !== "pan";
    canvas.selection = interactive;
    canvas.defaultCursor = interactive ? "default" : "grab";
    canvas.getObjects().forEach((obj) => {
      obj.selectable = interactive;
      obj.evented = interactive;
    });
    if (!interactive) canvas.discardActiveObject();
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
      commitRef.current();
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
    // A restored draft is the new baseline, not an undoable edit.
    const history = historyRef.current;
    history.lock = true;
    await canvas.loadFromJSON(json);
    canvas.requestRenderAll();
    history.lock = false;
    history.past = [];
    history.future = [];
    history.present = canvas.toJSON(CUSTOM_PROPS);
    setCanUndo(false);
    setCanRedo(false);
    emitItems(canvas, onItemsChangeRef.current);
  }, []);

  return {
    ready,
    zoomPct,
    hasSelection,
    selection,
    canUndo,
    canRedo,
    zoomIn,
    zoomOut,
    zoomReset,
    zoomToFit,
    addItem,
    addItems,
    removeSelected,
    removeById,
    selectById,
    duplicateSelected,
    setSelectionSize,
    rotateSelected,
    flipSelected,
    centerSelected,
    resetSelected,
    autoTrimSelected,
    getSelectionElement,
    applyProcessedImage,
    clearAll,
    setToolMode,
    undo,
    redo,
    tidyCanvas,
    exportState,
    importState,
  };
}

export { packShelf };
