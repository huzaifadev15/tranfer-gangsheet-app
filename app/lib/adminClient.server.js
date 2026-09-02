import { authenticate } from "../shopify.server";

// Resolves an Admin GraphQL caller for a storefront request arriving through
// the App Proxy.
//
// Why this exists: shopify.server.js is configured with MemorySessionStorage,
// so offline sessions only survive inside a single warm process. On serverless
// hosting (Vercel) a cold start starts with an empty store, and
// authenticate.public.appProxy then resolves without an `admin` client — which
// would make every proxy API route fail intermittently and unpredictably.
//
// So: prefer the real session, and fall back to the app's own offline token
// from the environment. Security is not weakened by the fallback —
// authenticate.public.appProxy still runs first and throws on a bad HMAC, so
// only genuinely Shopify-signed proxy requests ever reach this code.
//
// The durable fix is swapping MemorySessionStorage for a persistent store
// (@shopify/shopify-app-session-storage-prisma is already a dependency, and
// prisma/schema.prisma already defines the Session model) backed by a real
// database rather than the local sqlite file. Once that is in place the
// fallback simply stops being used.

const API_VERSION = "2026-10";

function normalizeShopDomain(shop) {
  if (!shop) return null;
  return shop.includes(".") ? shop : `${shop}.myshopify.com`;
}

/**
 * @returns {Promise<{ graphql: (query: string, variables?: object) => Promise<any>, shop: string, source: "session" | "env" }>}
 * @throws  {Response} 401 when neither a session nor an env token is available.
 */
export async function getProxyAdmin(request) {
  const { admin, session } = await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = normalizeShopDomain(
    session?.shop ||
      url.searchParams.get("shop") ||
      process.env.SHOPIFY_SHOP_DOMAIN,
  );

  if (admin) {
    return {
      shop,
      source: "session",
      graphql: async (query, variables = {}) => {
        const res = await admin.graphql(query, { variables });
        const body = await res.json();
        if (body.errors?.length) {
          const err = new Error(
            body.errors[0].message || "Shopify GraphQL error.",
          );
          err.statusCode = 502;
          throw err;
        }
        return body.data;
      },
    };
  }

  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!shop || !token) {
    const err = new Error(
      "No Shopify session for this shop, and no SHOPIFY_ACCESS_TOKEN fallback is configured.",
    );
    err.statusCode = 401;
    throw err;
  }

  return {
    shop,
    source: "env",
    graphql: async (query, variables = {}) => {
      const res = await fetch(
        `https://${shop}/admin/api/${API_VERSION}/graphql.json`,
        {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query, variables }),
        },
      );

      const raw = await res.text();
      let body;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        const err = new Error(
          `Shopify GraphQL returned a non-JSON response (status ${res.status}).`,
        );
        err.statusCode = 502;
        throw err;
      }

      if (!res.ok) {
        const err = new Error(
          body?.errors?.[0]?.message ||
            body?.errors ||
            `Shopify GraphQL request failed (${res.status}).`,
        );
        err.statusCode = res.status === 401 ? 401 : 502;
        throw err;
      }

      if (body.errors?.length) {
        const err = new Error(
          body.errors[0].message || "Shopify GraphQL returned errors.",
        );
        err.statusCode = 502;
        throw err;
      }

      return body.data;
    },
  };
}
