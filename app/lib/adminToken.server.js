import crypto from "node:crypto";

// Helpers for the one-off "generate an offline admin token" flow.
//
// Mirrors /shopify/auth + /shopify/callback from the Express backend app, with
// one deliberate change: that version kept OAuth nonces in an in-memory Set,
// which does not survive on serverless — the lambda that starts the flow is
// often not the one that handles the callback, so the state check fails at
// random. Here the state is a signed, self-describing value instead, so no
// server-side storage is needed and CSRF protection still holds.

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function normalizeShopDomain(shop) {
  if (!shop) return null;
  const trimmed = String(shop).trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!trimmed) return null;
  const full = trimmed.includes(".") ? trimmed : `${trimmed}.myshopify.com`;
  // Only ever redirect to a real Shopify domain.
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(full) ? full : null;
}

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createState(shop, secret) {
  const payload = b64url(JSON.stringify({ shop, ts: Date.now() }));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyState(state, secret) {
  if (typeof state !== "string" || !state.includes(".")) return null;
  const [payload, signature] = state.split(".");
  const expected = sign(payload, secret);

  const a = Buffer.from(signature || "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!decoded?.shop || !decoded?.ts) return null;
  if (Date.now() - decoded.ts > STATE_TTL_MS) return null;
  return decoded;
}

// Shopify signs the callback query string; recompute it over every param
// except hmac/signature and compare in constant time.
export function verifyCallbackHmac(searchParams, secret) {
  const provided = searchParams.get("hmac");
  if (!provided) return false;

  const message = [...searchParams.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const digest = crypto.createHmac("sha256", secret).update(message).digest("hex");
  const a = Buffer.from(digest);
  const b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Env access lives here rather than in the route modules: only *.server.js is
// guaranteed server-only (and is the only place eslint allows `process`).
function getOAuthConfig() {
  return {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecret: process.env.SHOPIFY_API_SECRET,
    appUrl: process.env.SHOPIFY_APP_URL,
    // Offline token for server-to-server calls; scopes come from the app config.
    scopes: process.env.SCOPES || "write_products",
  };
}

/** Builds the Shopify OAuth consent URL for a shop. Throws a Response on bad input. */
export function buildAuthorizeUrl(rawShop) {
  const shop = normalizeShopDomain(rawShop);
  if (!shop) {
    throw new Response("Provide a valid shop, e.g. my-store.myshopify.com", {
      status: 400,
    });
  }

  const { apiKey, apiSecret, appUrl, scopes } = getOAuthConfig();
  if (!apiKey || !apiSecret || !appUrl) {
    throw new Response(
      "SHOPIFY_API_KEY, SHOPIFY_API_SECRET and SHOPIFY_APP_URL must all be set.",
      { status: 500 },
    );
  }

  const authorize = new URL(`https://${shop}/admin/oauth/authorize`);
  authorize.searchParams.set("client_id", apiKey);
  authorize.searchParams.set("scope", scopes);
  authorize.searchParams.set(
    "redirect_uri",
    `${appUrl.replace(/\/$/, "")}/admin-token/callback`,
  );
  authorize.searchParams.set("state", createState(shop, apiSecret));

  return authorize.toString();
}

/** Verifies the OAuth callback and exchanges the code. Returns a plain result object. */
export async function completeTokenCallback(searchParams) {
  const { apiKey, apiSecret } = getOAuthConfig();
  if (!apiKey || !apiSecret) {
    return { error: "SHOPIFY_API_KEY / SHOPIFY_API_SECRET are not configured." };
  }

  const shop = normalizeShopDomain(searchParams.get("shop"));
  const code = searchParams.get("code");
  if (!shop || !code) {
    return { error: "Missing shop or code in the callback." };
  }

  if (!verifyCallbackHmac(searchParams, apiSecret)) {
    return {
      error: "HMAC validation failed — this request was not signed by Shopify.",
    };
  }

  const state = verifyState(searchParams.get("state"), apiSecret);
  if (!state) {
    return { error: "Invalid or expired state. Start the flow again." };
  }
  if (state.shop !== shop) {
    return { error: "State does not match the shop that came back." };
  }

  try {
    const data = await exchangeCodeForToken({ shop, code, apiKey, apiSecret });
    return { shop, accessToken: data.access_token, scope: data.scope };
  } catch (error) {
    return { error: error?.message || "Token exchange failed." };
  }
}

export async function exchangeCodeForToken({ shop, code, apiKey, apiSecret }) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
      code,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const err = new Error(
      data?.error_description || data?.error || "Failed to exchange code for an access token.",
    );
    err.statusCode = 400;
    throw err;
  }
  return data;
}
