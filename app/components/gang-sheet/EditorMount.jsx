import { useEffect, useState } from "react";

// Client-only mount point. The route renders this inside SSR with no browser
// APIs touched; the real editor (which needs window/document/canvas) is
// lazy-imported here, after mount, so Fabric/pdfjs never load during SSR and
// never bloat the route's initial JS chunk.
export default function EditorMount({ shop, ...editorProps }) {
  const [Editor, setEditor] = useState(null);

  useEffect(() => {
    let cancelled = false;
    import("./GangSheetBuilderApp.jsx").then((mod) => {
      if (!cancelled) setEditor(() => mod.default);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!Editor) {
    return (
      <div className="gsb-loading">
        <div className="gsb-loading-spinner" aria-hidden="true" />
        <p>Loading gang sheet builder…</p>
      </div>
    );
  }

  return <Editor shop={shop} {...editorProps} />;
}
