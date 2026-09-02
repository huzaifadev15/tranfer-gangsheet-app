import { useLoaderData } from "react-router";
import { completeTokenCallback } from "../lib/adminToken.server";

// Step 2: Shopify redirects here with ?code=. Verify it really came from
// Shopify, swap the code for an offline access token, and show the token once
// so it can be pasted into the environment as SHOPIFY_ACCESS_TOKEN.
//
// The token is deliberately not persisted anywhere — showing it once and
// letting the operator store it in the env is the whole point of this flow.
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  return completeTokenCallback(url.searchParams);
};

export const meta = () => [{ title: "Admin token" }];

const wrap = {
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
  maxWidth: 640,
  margin: "60px auto",
  padding: 24,
  lineHeight: 1.55,
};
const codeBox = {
  display: "block",
  background: "#0f172a",
  color: "#e2e8f0",
  padding: "14px 16px",
  borderRadius: 8,
  wordBreak: "break-all",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 13,
  margin: "10px 0 18px",
};

export default function AdminTokenCallback() {
  const data = useLoaderData();

  if (data.error) {
    return (
      <div style={wrap}>
        <h2 style={{ color: "#b91c1c" }}>Couldn&rsquo;t generate a token</h2>
        <p>{data.error}</p>
        <p>
          <a href="/">Start again</a>
        </p>
      </div>
    );
  }

  const envLine = `SHOPIFY_ACCESS_TOKEN=${data.accessToken}`;

  return (
    <div style={wrap}>
      <h2 style={{ color: "#15803d" }}>✓ Token generated</h2>
      <p>
        Offline admin token for <strong>{data.shop}</strong>. Copy the line
        below into your environment variables (Vercel → Settings → Environment
        Variables), then redeploy.
      </p>

      <code style={codeBox}>{envLine}</code>

      <p style={{ fontSize: 13, color: "#475569" }}>
        Granted scopes: <code>{data.scope}</code>
      </p>

      {data.expiresIn ? (
        <p
          style={{
            fontSize: 13,
            color: "#9a3412",
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          <strong>This token expires.</strong> Valid for{" "}
          {Math.round(data.expiresIn / 3600)}h (until{" "}
          {new Date(data.expiresAt).toLocaleString()}). The app is configured
          with <code>expiringOfflineAccessTokens</code>, so it must be
          refreshed or regenerated before it lapses
          {data.refreshToken ? " (a refresh token was issued)" : ""}.
        </p>
      ) : (
        <p style={{ fontSize: 13, color: "#166534" }}>
          <strong>No expiry.</strong> Shopify returned no{" "}
          <code>expires_in</code>, so this is a standard offline token — it
          stays valid until the app is uninstalled or the token is revoked.
        </p>
      )}

      <p
        style={{
          fontSize: 13,
          color: "#92400e",
          background: "#fffbeb",
          border: "1px solid #fde68a",
          borderRadius: 8,
          padding: "10px 12px",
        }}
      >
        This token is shown once and is not stored anywhere by the app. It grants
        full API access for the scopes above — treat it like a password, and
        don&rsquo;t paste it anywhere public. Reload this page and it is gone.
      </p>

      <p>
        <a href="/">Back to start</a>
      </p>
    </div>
  );
}
