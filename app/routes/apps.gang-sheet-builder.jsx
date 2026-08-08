import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import EditorMount from "../components/gang-sheet/EditorMount";

// Storefront-facing route, reached via Shopify's App Proxy at
// https://<shop>/apps/gang-sheet-builder (see [app_proxy] in shopify.app.toml).
// Deliberately NOT nested under app/routes/app.jsx — no Polaris, no App
// Bridge, no admin auth. authenticate.public.appProxy just validates
// Shopify's HMAC signature on the request.
export const loader = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const shop = session?.shop ?? url.searchParams.get("shop") ?? "";

  return { shop };
};

export const meta = () => [{ title: "Gang Sheet Builder" }];

export default function GangSheetBuilderRoute() {
  const { shop } = useLoaderData();
  return <EditorMount shop={shop} />;
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
