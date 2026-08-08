import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./gang-sheet.css";
import { useFabricCanvas } from "./useFabricCanvas";
import { packShelf, coveragePercent } from "./binPacking";
import { ingestFile } from "./fileIngestion";
import { renderTextTile } from "./textTiles";
import { saveDraft, restoreDraft } from "./persistence";
import { ftToIn, SHEET_WIDTH_IN } from "./units";
import LeftPanel from "./LeftPanel";
import CanvasArea from "./CanvasArea";
import RightPanel from "./RightPanel";
import SheetSizeControl from "./SheetSizeControl";
import NamesNumbersModal from "./NamesNumbersModal";
import UploadModal from "./UploadModal";
import IssuePanel from "./IssuePanel";
import { findOverlaps, findOutOfBounds } from "./overlap";

const MATERIALS = ["DTF", "UV DTF", "Sublimation"];

function makeTempId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function packAndPosition(rawItems, sheetWidthIn) {
  const { placements } = packShelf(
    rawItems.map((item) => ({ id: item.id, widthIn: item.widthIn, heightIn: item.heightIn })),
    sheetWidthIn,
  );
  const byId = new Map(placements.map((p) => [p.id, p]));
  return rawItems.map((item) => ({
    item,
    position: {
      xIn: byId.get(item.id)?.xIn ?? 0.25,
      yIn: byId.get(item.id)?.yIn ?? 0.25,
    },
  }));
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
  const [allowOverlaps, setAllowOverlaps] = useState(false);

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

      if ((e.key === "Delete" || e.key === "Backspace") && canvasApi.hasSelection) {
        e.preventDefault();
        canvasApi.removeSelected();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d" && canvasApi.hasSelection) {
        e.preventDefault();
        canvasApi.duplicateSelected();
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
      const offset = 0.25 + (items.length % 8) * 0.3;
      await canvasApi.addItem(item, { xIn: offset, yIn: offset });
      setBusy(false);
    },
    [canvasApi, items.length],
  );

  const handleAutoBuild = useCallback(async () => {
    if (library.length === 0) return;
    setBusy(true);
    setErrorMsg(null);
    const batch = library.map((item) => ({ ...item, id: makeTempId("auto") }));
    await canvasApi.addItems(packAndPosition(batch, SHEET_WIDTH_IN));
    setBusy(false);
  }, [canvasApi, library]);

  const handleRemoveLibraryItem = useCallback((id) => {
    setLibrary((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleClearLibrary = useCallback(() => setLibrary([]), []);

  const handleNamesNumbersSubmit = useCallback(
    async (rosterText, style) => {
      setBusy(true);
      const lines = rosterText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const tiles = lines.map((line) => {
        const { dataUrl, widthIn, heightIn } = renderTextTile(line, style);
        return { kind: "text", dataUrl, widthIn, heightIn, label: line, id: makeTempId("text") };
      });
      if (tiles.length > 0) {
        await canvasApi.addItems(packAndPosition(tiles, SHEET_WIDTH_IN));
      }
      setBusy(false);
      setNamesNumbersOpen(false);
    },
    [canvasApi],
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

  const handleTidy = useCallback(() => {
    setAllowOverlaps(false);
    canvasApi.tidyCanvas();
  }, [canvasApi]);

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
          onAutoBuildClick={handleAutoBuild}
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
          onAutoBuildCta={() => (library.length > 0 ? handleAutoBuild() : setUploadOpen(true))}
          onNamesNumbersCta={() => setNamesNumbersOpen(true)}
          selection={canvasApi.selection}
          onDuplicateSelected={canvasApi.duplicateSelected}
          onDeleteSelected={canvasApi.removeSelected}
        />

        <RightPanel
          imageCount={items.length}
          sheetLengthFt={sheetLengthFt}
          material={material}
          coveragePct={coveragePct}
          onSave={handleSave}
          saveStatus={saveStatus}
        />
      </div>

      <IssuePanel
        overlaps={overlaps}
        outOfBounds={outOfBounds}
        onTidy={handleTidy}
        onAllowOverlaps={() => setAllowOverlaps(true)}
      />

      {errorMsg && <div className="gsb-toast gsb-toast-error">{errorMsg}</div>}

      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onFiles={handleFilesSelected}
          progress={uploadProgress}
        />
      )}

      {namesNumbersOpen && (
        <NamesNumbersModal
          onClose={() => setNamesNumbersOpen(false)}
          onSubmit={handleNamesNumbersSubmit}
          busy={busy}
        />
      )}
    </div>
  );
}
