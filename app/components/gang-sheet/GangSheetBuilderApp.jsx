import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./gang-sheet.css";
import { useFabricCanvas } from "./useFabricCanvas";
import { coveragePercent } from "./binPacking";
import { ingestFile } from "./fileIngestion";
import { saveDraft, restoreDraft } from "./persistence";
import { ftToIn, SHEET_WIDTH_IN } from "./units";
import LeftPanel from "./LeftPanel";
import CanvasArea from "./CanvasArea";
import RightPanel from "./RightPanel";
import SheetSizeControl from "./SheetSizeControl";
import NamesNumbersModal from "./NamesNumbersModal";
import UploadModal from "./UploadModal";
import IssuePanel from "./IssuePanel";
import ImageOptionsPanel from "./ImageOptionsPanel";
import AutoBuilderModal from "./AutoBuilderModal";
import { findOverlaps, findOutOfBounds, MIN_GAP_IN } from "./overlap";

const MATERIALS = ["DTF", "UV DTF", "Sublimation"];

function makeTempId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function GangSheetBuilderApp({ shop }) {
  const canvasElRef = useRef(null);
  const viewportRef = useRef(null);
  const restoredRef = useRef(false);
  const autoFitRef = useRef(false);

  const [sheetLengthFt, setSheetLengthFt] = useState(2);
  const [material, setMaterial] = useState(MATERIALS[0]);
  const [items, setItems] = useState([]);
  const [library, setLibrary] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [namesNumbersOpen, setNamesNumbersOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [autoBuilderOpen, setAutoBuilderOpen] = useState(false);
  const [allowOverlaps, setAllowOverlaps] = useState(false);
  const [optionsDismissed, setOptionsDismissed] = useState(false);

  const sheetHeightIn = ftToIn(sheetLengthFt);

  const handleItemsChange = useCallback((nextItems) => {
    setItems(nextItems);
  }, []);

  const canvasApi = useFabricCanvas({
    canvasRef: canvasElRef,
    sheetWidthIn: SHEET_WIDTH_IN,
    sheetHeightIn,
    onItemsChange: handleItemsChange,
  });

  // Restore a locally-saved draft once the canvas is ready.
  useEffect(() => {
    if (!canvasApi.ready || restoredRef.current) return;
    restoredRef.current = true;
    const draft = restoreDraft(shop);
    if (draft) {
      if (draft.sheetLengthFt) setSheetLengthFt(draft.sheetLengthFt);
      if (draft.canvasJson) canvasApi.importState(draft.canvasJson);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasApi.ready]);

  useEffect(() => {
    if (!errorMsg) return undefined;
    const timer = setTimeout(() => setErrorMsg(null), 5000);
    return () => clearTimeout(timer);
  }, [errorMsg]);

  useEffect(() => {
    if (!saveStatus) return undefined;
    const timer = setTimeout(() => setSaveStatus(null), 2500);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  // Delete / duplicate keyboard shortcuts, ignored while typing in a field.
  useEffect(() => {
    function onKeyDown(e) {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if ((e.key === "Delete" || e.key === "Backspace") && canvasApi.hasSelection) {
        e.preventDefault();
        canvasApi.removeSelected();
      } else if (mod && key === "d" && canvasApi.hasSelection) {
        e.preventDefault();
        canvasApi.duplicateSelected();
      } else if (mod && key === "z" && e.shiftKey) {
        e.preventDefault();
        canvasApi.redo();
      } else if (mod && key === "z") {
        e.preventDefault();
        canvasApi.undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        canvasApi.redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canvasApi]);

  // Uploads land in the left-panel library first; placing them on the sheet
  // is a separate, explicit step (individually, or all at once via Auto Build).
  const handleFilesSelected = useCallback(async (fileList) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setBusy(true);
    setErrorMsg(null);
    setUploadProgress({ done: 0, total: files.length, current: files[0].name });

    const ingested = [];
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      setUploadProgress({ done: i, total: files.length, current: file.name });
      try {
        // eslint-disable-next-line no-await-in-loop
        const item = await ingestFile(file);
        ingested.push({ ...item, id: makeTempId("img") });
      } catch (err) {
        setErrorMsg(err.message || "Couldn't add that file.");
      }
    }

    setUploadProgress({ done: files.length, total: files.length, current: "" });
    setLibrary((prev) => [...prev, ...ingested]);
    setUploadProgress(null);
    setUploadOpen(false);
    setBusy(false);
  }, []);

  const handlePlaceLibraryItem = useCallback(
    async (item) => {
      setBusy(true);
      // Drop new artwork clear of whatever is already on the sheet — a fixed
      // cascade offset just buried each new image under the previous one.
      const lowestEdge = items.reduce(
        (lowest, placed) => Math.max(lowest, placed.boxYIn + placed.boxHIn),
        0,
      );
      const yIn = items.length === 0 ? MIN_GAP_IN : lowestEdge + MIN_GAP_IN;
      await canvasApi.addItem(item, { xIn: MIN_GAP_IN, yIn });
      setBusy(false);
    },
    [canvasApi, items],
  );

  const handleAutoBuildApply = useCallback(
    async ({ entries, neededFt, gapIn, marginIn }) => {
      setAutoBuilderOpen(false);
      setBusy(true);
      setErrorMsg(null);
      setAllowOverlaps(false);

      // Grow the sheet if the planned layout needs more length than the
      // current selection, so nothing lands outside the printable area.
      const targetFt = Math.max(neededFt, sheetLengthFt);
      if (neededFt > sheetLengthFt) setSheetLengthFt(neededFt);

      await canvasApi.addItems(
        entries.map(({ item, position }) => ({
          item: { ...item, id: makeTempId("auto") },
          position,
        })),
        { sheetHeightIn: ftToIn(targetFt) },
      );

      // The plan only packs the new batch, so it can't know about artwork
      // already on the sheet. Repack everything together — that's what makes
      // an applied layout overlap-free by construction.
      const { usedHeightIn } = canvasApi.tidyCanvas({ gapIn, marginIn });
      const finalFt = Math.max(targetFt, Math.ceil(usedHeightIn / 12) || 1);
      if (finalFt > sheetLengthFt) setSheetLengthFt(finalFt);

      setBusy(false);
    },
    [canvasApi, sheetLengthFt],
  );

  const handleRemoveLibraryItem = useCallback((id) => {
    setLibrary((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleClearLibrary = useCallback(() => setLibrary([]), []);

  const handleNamesNumbersSubmit = useCallback(
    async ({ entries, neededFt, gapIn, marginIn }) => {
      setNamesNumbersOpen(false);
      setBusy(true);
      setAllowOverlaps(false);

      // Same contract as Auto Build: the modal packs only its own tiles, so
      // grow the sheet to fit them and repack everything afterwards rather
      // than dropping the roster on top of artwork already placed.
      const targetFt = Math.max(neededFt, sheetLengthFt);
      if (neededFt > sheetLengthFt) setSheetLengthFt(neededFt);

      await canvasApi.addItems(entries, { sheetHeightIn: ftToIn(targetFt) });

      const { usedHeightIn } = canvasApi.tidyCanvas({ gapIn, marginIn });
      const finalFt = Math.max(targetFt, Math.ceil(usedHeightIn / 12) || 1);
      if (finalFt > sheetLengthFt) setSheetLengthFt(finalFt);

      setBusy(false);
    },
    [canvasApi, sheetLengthFt],
  );

  const handleSave = useCallback(() => {
    const canvasJson = canvasApi.exportState();
    const ok = saveDraft(shop, { canvasJson, sheetLengthFt });
    setSaveStatus(ok ? "Saved to this browser" : "Couldn't save — storage unavailable");
  }, [canvasApi, shop, sheetLengthFt]);

  const handleZoomFit = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    canvasApi.zoomToFit(el.clientWidth - 40);
  }, [canvasApi]);

  // Fit the whole sheet in view on first load instead of defaulting to
  // 100%, which for a multi-foot sheet is far taller than the viewport and
  // buries the empty-state prompt off-screen below the fold.
  useEffect(() => {
    if (!canvasApi.ready || autoFitRef.current) return;
    autoFitRef.current = true;
    requestAnimationFrame(() => handleZoomFit());
  }, [canvasApi.ready, handleZoomFit]);

  const coveragePct = useMemo(
    () => coveragePercent(items, SHEET_WIDTH_IN, sheetHeightIn),
    [items, sheetHeightIn],
  );

  const overlaps = useMemo(
    () => (allowOverlaps ? [] : findOverlaps(items)),
    [items, allowOverlaps],
  );

  const outOfBounds = useMemo(
    () => findOutOfBounds(items, SHEET_WIDTH_IN, sheetHeightIn),
    [items, sheetHeightIn],
  );

  // Selecting a different object re-opens the inspector that a previous
  // "×" dismissed, matching how the panel behaves as a per-selection sheet.
  const selectedId = canvasApi.selection?.id ?? null;
  useEffect(() => {
    if (selectedId) setOptionsDismissed(false);
  }, [selectedId]);

  const handleDuplicateById = useCallback(
    (id) => {
      canvasApi.selectById(id);
      canvasApi.duplicateSelected();
    },
    [canvasApi],
  );

  // Length the artwork actually reaches, so the issue panel can offer a
  // one-click sheet that fits instead of only re-packing.
  const suggestedFt = useMemo(() => {
    if (items.length === 0) return null;
    const lowestIn = items.reduce((low, item) => Math.max(low, item.boxYIn + item.boxHIn), 0);
    const needFt = Math.ceil(lowestIn / 12);
    return needFt > sheetLengthFt ? Math.min(20, needFt) : null;
  }, [items, sheetLengthFt]);

  const handleTidy = useCallback(() => {
    setAllowOverlaps(false);
    const { usedHeightIn } = canvasApi.tidyCanvas();
    // Repacking can need more length than the current sheet; grow rather than
    // squashing artwork back inside, which would reintroduce overlaps.
    const needFt = Math.ceil(usedHeightIn / 12) || 1;
    if (needFt > sheetLengthFt) setSheetLengthFt(needFt);
  }, [canvasApi, sheetLengthFt]);

  return (
    <div className="gsb-root">
      <header className="gsb-topbar">
        <div className="gsb-topbar-title">
          <span className="gsb-topbar-eyebrow">Gang Sheet Builder</span>
        </div>
        <div className="gsb-topbar-controls">
          <div className="gsb-topbar-field">
            <span>Size</span>
            <SheetSizeControl valueFt={sheetLengthFt} onChange={setSheetLengthFt} />
          </div>
          <label className="gsb-topbar-field">
            <span>Type</span>
            <select
              className="gsb-select"
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
            >
              {MATERIALS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="gsb-body">
        <LeftPanel
          onAddImagesClick={() => setUploadOpen(true)}
          onFilesDropped={handleFilesSelected}
          onAutoBuildClick={() => setAutoBuilderOpen(true)}
          onNamesNumbersClick={() => setNamesNumbersOpen(true)}
          onTidyCanvasClick={handleTidy}
          busy={busy}
          hasItems={items.length > 0}
          hasSelection={canvasApi.hasSelection}
          onDuplicateSelected={canvasApi.duplicateSelected}
          onDeleteSelected={canvasApi.removeSelected}
          library={library}
          onPlaceLibraryItem={handlePlaceLibraryItem}
          onRemoveLibraryItem={handleRemoveLibraryItem}
          onClearLibrary={handleClearLibrary}
        />

        {canvasApi.selection && !optionsDismissed && (
          <ImageOptionsPanel
            selection={canvasApi.selection}
            onClose={() => setOptionsDismissed(true)}
            onRemove={canvasApi.removeSelected}
            onResize={canvasApi.setSelectionSize}
            onDuplicate={canvasApi.duplicateSelected}
            onAutoTrim={canvasApi.autoTrimSelected}
            onRotate={canvasApi.rotateSelected}
            onFlip={canvasApi.flipSelected}
            onCenter={canvasApi.centerSelected}
            onReset={canvasApi.resetSelected}
            trimAvailable={canvasApi.selection.kind === "image"}
          />
        )}

        <CanvasArea
          canvasElRef={canvasElRef}
          containerRef={viewportRef}
          sheetWidthIn={SHEET_WIDTH_IN}
          sheetHeightIn={sheetHeightIn}
          zoomPct={canvasApi.zoomPct}
          onZoomIn={canvasApi.zoomIn}
          onZoomOut={canvasApi.zoomOut}
          onZoomReset={canvasApi.zoomReset}
          onZoomFit={handleZoomFit}
          isEmpty={items.length === 0}
          onManualBuildCta={() => setUploadOpen(true)}
          onAutoBuildCta={() =>
            library.length > 0 ? setAutoBuilderOpen(true) : setUploadOpen(true)
          }
          onNamesNumbersCta={() => setNamesNumbersOpen(true)}
          selection={canvasApi.selection}
          onDuplicateSelected={canvasApi.duplicateSelected}
          onDeleteSelected={canvasApi.removeSelected}
          onUndo={canvasApi.undo}
          onRedo={canvasApi.redo}
          canUndo={canvasApi.canUndo}
          canRedo={canvasApi.canRedo}
        />

        <RightPanel
          items={items}
          selectedId={selectedId}
          sheetLengthFt={sheetLengthFt}
          material={material}
          coveragePct={coveragePct}
          onSave={handleSave}
          saveStatus={saveStatus}
          onSelectItem={canvasApi.selectById}
          onRemoveItem={canvasApi.removeById}
          onDuplicateItem={handleDuplicateById}
        />
      </div>

      <IssuePanel
        overlaps={overlaps}
        outOfBounds={outOfBounds}
        onTidy={handleTidy}
        onAllowOverlaps={() => setAllowOverlaps(true)}
        suggestedFt={suggestedFt}
        onGrowSheet={setSheetLengthFt}
      />

      {errorMsg && <div className="gsb-toast gsb-toast-error">{errorMsg}</div>}

      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onFiles={handleFilesSelected}
          progress={uploadProgress}
        />
      )}

      {autoBuilderOpen && (
        <AutoBuilderModal
          library={library}
          sheetWidthIn={SHEET_WIDTH_IN}
          onCancel={() => setAutoBuilderOpen(false)}
          onApply={handleAutoBuildApply}
          onAddMore={() => {
            setAutoBuilderOpen(false);
            setUploadOpen(true);
          }}
        />
      )}

      {namesNumbersOpen && (
        <NamesNumbersModal
          sheetWidthIn={SHEET_WIDTH_IN}
          onClose={() => setNamesNumbersOpen(false)}
          onSubmit={handleNamesNumbersSubmit}
          busy={busy}
        />
      )}
    </div>
  );
}
