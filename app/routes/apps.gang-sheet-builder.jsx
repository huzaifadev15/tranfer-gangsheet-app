import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import EditorMount from "../components/gang-sheet/EditorMount";

// Storefront-facing route, reached via Shopify's App Proxy at
// https://<shop>/apps/gang-sheet-builder (see [app_proxy] in shopify.app.toml).
// Deliberately NOT nested under app/routes/app.jsx — no Polaris, no App
// Bridge, no admin auth. authenticate.public.appProxy just validates
// Shopify's HMAC signature on the request.
// Deep-link params the storefront PDP appends to the builder link so the
// customer's size / film / price choices carry over instead of the editor
// opening on its defaults. All are optional — a bare visit still works.
const MAX_SHEET_FT = 40;

function parseSheetFt(raw) {
  const ft = Number(raw);
  if (!Number.isFinite(ft) || ft <= 0) return null;
  return Math.min(MAX_SHEET_FT, Math.round(ft * 2) / 2);
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const shop = session?.shop ?? url.searchParams.get("shop") ?? "";
  const params = url.searchParams;

  return {
    shop,
    initialSheetFt: parseSheetFt(params.get("ft")),
    initialFilm: params.get("film") || null,
    initialPrice: params.get("price") || null,
    initialVariantId: params.get("variant") || null,
  };
};

export const meta = () => [{ title: "Gang Sheet Builder" }];

export default function GangSheetBuilderRoute() {
  const { shop, initialSheetFt, initialFilm, initialPrice, initialVariantId } =
    useLoaderData();
  return (
    <EditorMount
      shop={shop}
      initialSheetFt={initialSheetFt}
      initialFilm={initialFilm}
      initialPrice={initialPrice}
      initialVariantId={initialVariantId}
    />
  );
}

export function ErrorBoundary() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        gap: 8,
        textAlign: "center",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <h1>Something went wrong</h1>
      <p>Please refresh the page and try again.</p>
    </div>
  );
}
