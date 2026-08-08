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
  const manualInputRef = useRef(null);
  const autoInputRef = useRef(null);

  const [sheetLengthFt, setSheetLengthFt] = useState(2);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [namesNumbersOpen, setNamesNumbersOpen] = useState(false);

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

  const handleAddImages = useCallback(
    async (fileList) => {
      setBusy(true);
      setErrorMsg(null);
      const files = Array.from(fileList);
      let cascade = 0;
      for (const file of files) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const item = await ingestFile(file);
          const offset = 0.25 + cascade * 0.3;
          // eslint-disable-next-line no-await-in-loop
          await canvasApi.addItem(item, { xIn: offset, yIn: offset });
          cascade += 1;
        } catch (err) {
          setErrorMsg(err.message || "Couldn't add that file.");
        }
      }
      setBusy(false);
    },
    [canvasApi],
  );

  const handleAutoBuild = useCallback(
    async (fileList) => {
      setBusy(true);
      setErrorMsg(null);
      const files = Array.from(fileList);
      const ingested = [];
      for (const file of files) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const item = await ingestFile(file);
          ingested.push({ ...item, id: makeTempId("auto") });
        } catch (err) {
          setErrorMsg(err.message || "Couldn't add that file.");
        }
      }
      if (ingested.length > 0) {
        await canvasApi.addItems(packAndPosition(ingested, SHEET_WIDTH_IN));
      }
      setBusy(false);
    },
    [canvasApi],
  );

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
    canvasApi.zoomToFit(el.clientWidth - 40, el.clientHeight - 40);
  }, [canvasApi]);

  const coveragePct = useMemo(
    () => coveragePercent(items, SHEET_WIDTH_IN, sheetHeightIn),
    [items, sheetHeightIn],
  );

  return (
    <div className="gsb-root">
      <input
        ref={manualInputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,application/pdf,.png,.jpg,.jpeg,.svg,.pdf"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) handleAddImages(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={autoInputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,application/pdf,.png,.jpg,.jpeg,.svg,.pdf"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) handleAutoBuild(e.target.files);
          e.target.value = "";
        }}
      />

      <header className="gsb-topbar">
        <div className="gsb-topbar-title">
          <span className="gsb-topbar-eyebrow">Gang Sheet Builder</span>
        </div>
        <SheetSizeControl valueFt={sheetLengthFt} onChange={setSheetLengthFt} />
      </header>

      <div className="gsb-body">
        <LeftPanel
          onAddImagesClick={() => manualInputRef.current?.click()}
          onFilesDropped={handleAddImages}
          onAutoBuildClick={() => autoInputRef.current?.click()}
          onNamesNumbersClick={() => setNamesNumbersOpen(true)}
          onTidyCanvasClick={canvasApi.tidyCanvas}
          busy={busy}
          hasItems={items.length > 0}
          hasSelection={canvasApi.hasSelection}
          onDuplicateSelected={canvasApi.duplicateSelected}
          onDeleteSelected={canvasApi.removeSelected}
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
          onManualBuildCta={() => manualInputRef.current?.click()}
          onAutoBuildCta={() => autoInputRef.current?.click()}
          onNamesNumbersCta={() => setNamesNumbersOpen(true)}
        />

        <RightPanel
          imageCount={items.length}
          sheetLengthFt={sheetLengthFt}
          coveragePct={coveragePct}
          onSave={handleSave}
          saveStatus={saveStatus}
        />
      </div>

      {errorMsg && <div className="gsb-toast gsb-toast-error">{errorMsg}</div>}

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
