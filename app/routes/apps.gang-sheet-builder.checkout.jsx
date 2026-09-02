import { getProxyAdmin } from "../lib/adminClient.server";

// Storefront-facing checkout endpoint, reached through Shopify's App Proxy at
// https://<shop>/apps/gang-sheet-builder/checkout.
//
// Mirrors POST /api/shopify/checkout from the Express backend app: build the
// line items, create one draft order across all of them, and hand back the
// invoiceUrl to redirect the customer to.
//
// A draft order is used rather than a cart permalink because the quoted gang
// sheet price is per-design (size x film), so the price has to be set on the
// line item itself. Draft order invoiceUrl also works for DRAFT-status
// products, which cart permalinks do not.
//
// Two ways to price a line item:
//   1. `variantId` — an existing storefront variant is used as-is. Preferred:
//      no throwaway products, and the merchant's real pricing applies.
//   2. `unitPrice` — a hidden product/variant is created at the quoted price,
//      the same fallback the Express app uses. Cleaned up if anything fails.

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function appendCheckoutParams(invoiceUrl) {
  if (!invoiceUrl) return invoiceUrl;
  const sep = invoiceUrl.includes("?") ? "&" : "?";
  return `${invoiceUrl}${sep}auto_redirect=false&edge_redirect=true&skip_shop_pay=true`;
}


async function cleanupCheckoutProducts(gql, productIds) {
  await Promise.all(
    productIds.map((id) =>
      gql(
        `#graphql
        mutation DeleteCheckoutProduct($input: ProductDeleteInput!) {
          productDelete(input: $input) { userErrors { field message } }
        }`,
        { input: { id } },
      ).catch((err) => {
        console.error("[GANG-SHEET CHECKOUT] Cleanup error:", err.message);
      }),
    ),
  );
}

// Line-item attributes shown on the order so production knows what to print.
function buildCustomAttributes(item) {
  const attrs = [];
  if (item.sheetFt) attrs.push({ key: "Sheet Length", value: `${item.sheetFt} ft` });
  if (item.film) attrs.push({ key: "Film", value: String(item.film) });
  if (item.imageCount != null)
    attrs.push({ key: "Images", value: String(item.imageCount) });
  if (item.artworkUrl)
    attrs.push({ key: "Artwork", value: String(item.artworkUrl) });
  if (item.previewUrl)
    attrs.push({ key: "Preview", value: String(item.previewUrl) });
  return attrs;
}

// Creates a hidden product + variant priced at the quoted amount, for when no
// existing variant was supplied. Throws with .statusCode on failure.
async function createCheckoutProductForItem(gql, item) {
  const unitPrice = Number(Number(item.unitPrice || 0).toFixed(2));
  if (!unitPrice || unitPrice <= 0) {
    const err = new Error(
      "Each line item needs either a variantId or a unitPrice greater than 0.",
    );
    err.statusCode = 400;
    throw err;
  }

  const title =
    item.productTitle ||
    `Custom DTF Gang Sheet${item.sheetFt ? ` — ${item.sheetFt} ft` : ""}${item.film ? ` (${item.film})` : ""}`;

  const productData = await gql(
    `#graphql
    mutation productCreate($product: ProductCreateInput!) {
      productCreate(product: $product) {
        product { id variants(first: 1) { nodes { id } } }
        userErrors { field message }
      }
    }`,
    {
      product: {
        title,
        status: "DRAFT",
        productType: "Gang Sheet",
        vendor: "Gang Sheet Builder",
        tags: ["gang-sheet-checkout"],
      },
    },
  );

  const productErrors = productData.productCreate.userErrors;
  if (productErrors.length) {
    const err = new Error(productErrors[0].message);
    err.statusCode = 400;
    err.userErrors = productErrors;
    throw err;
  }

  const product = productData.productCreate.product;
  const variantId = product.variants.nodes[0]?.id;

  // productCreate makes a default variant at price 0; set the quoted price.
  const variantData = await gql(
    `#graphql
    mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id }
        userErrors { field message }
      }
    }`,
    {
      productId: product.id,
      variants: [
        {
          id: variantId,
          price: unitPrice.toFixed(2),
          inventoryPolicy: "CONTINUE",
        },
      ],
    },
  );

  const variantErrors = variantData.productVariantsBulkUpdate.userErrors;
  if (variantErrors.length) {
    const err = new Error(variantErrors[0].message);
    err.statusCode = 400;
    err.userErrors = variantErrors;
    // Surface the id so the caller can clean this product up.
    err.createdProductId = product.id;
    throw err;
  }

  return { productId: product.id, variantId, unitPrice, productTitle: title };
}

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ ok: false, message: "Method not allowed" }, 405);
  }

  let gql;
  try {
    ({ graphql: gql } = await getProxyAdmin(request));
  } catch (error) {
    return json(
      { ok: false, message: error?.message || "Unauthorized" },
      error?.statusCode || 401,
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Expected a JSON body." }, 400);
  }

  const rawItems =
    Array.isArray(body.lineItems) && body.lineItems.length > 0
      ? body.lineItems
      : [body];

  const createdProductIds = [];

  try {
    const builtItems = [];

    for (const rawItem of rawItems) {
      const qty = Math.max(1, Number(rawItem?.quantity) || 1);
      const attrs = buildCustomAttributes(rawItem || {});

      if (rawItem?.variantId) {
        builtItems.push({
          variantId: String(rawItem.variantId).startsWith("gid://")
            ? rawItem.variantId
            : `gid://shopify/ProductVariant/${rawItem.variantId}`,
          qty,
          customAttributes: attrs,
          productTitle: rawItem.productTitle || "Custom DTF Gang Sheet",
          unitPrice: rawItem.unitPrice ?? null,
        });
        continue;
      }

      const created = await createCheckoutProductForItem(gql, rawItem || {});
      createdProductIds.push(created.productId);
      builtItems.push({
        variantId: created.variantId,
        qty,
        customAttributes: attrs,
        productTitle: created.productTitle,
        unitPrice: created.unitPrice,
      });
    }

    const draftData = await gql(
      `#graphql
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder { id name totalPrice invoiceUrl }
          userErrors { field message }
        }
      }`,
      {
        input: {
          lineItems: builtItems.map((i) => ({
            variantId: i.variantId,
            quantity: i.qty,
            customAttributes: i.customAttributes,
          })),
          note: builtItems.map((i) => i.productTitle).join(" + "),
          tags: ["gang-sheet-checkout"],
        },
      },
    );

    const draftErrors = draftData?.draftOrderCreate?.userErrors || [];
    if (draftErrors.length) {
      await cleanupCheckoutProducts(gql, createdProductIds);
      return json(
        {
          ok: false,
          message: draftErrors[0]?.message || "Failed to create draft order.",
          userErrors: draftErrors,
        },
        400,
      );
    }

    const draftOrder = draftData?.draftOrderCreate?.draftOrder;
    if (!draftOrder?.invoiceUrl) {
      await cleanupCheckoutProducts(gql, createdProductIds);
      return json(
        {
          ok: false,
          message: "Draft order created but invoiceUrl not returned.",
          draftOrder,
        },
        502,
      );
    }

    return json({
      ok: true,
      invoiceUrl: appendCheckoutParams(draftOrder.invoiceUrl),
      draftOrder: {
        id: draftOrder.id,
        name: draftOrder.name,
        totalPrice: draftOrder.totalPrice,
      },
      items: builtItems.map((i) => ({
        variantId: i.variantId,
        qty: i.qty,
        unitPrice: i.unitPrice,
      })),
    });
  } catch (error) {
    if (error?.createdProductId) createdProductIds.push(error.createdProductId);
    await cleanupCheckoutProducts(gql, createdProductIds);
    return json(
      {
        ok: false,
        message: error?.message || "Failed to create checkout.",
        ...(error?.userErrors ? { userErrors: error.userErrors } : {}),
      },
      error?.statusCode || 500,
    );
  }
};
