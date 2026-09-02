import { authenticate } from "../shopify.server";
import { getProxyAdmin } from "../lib/adminClient.server";

// Storefront-facing upload endpoint, reached through Shopify's App Proxy at
// https://<shop>/apps/gang-sheet-builder/upload.
//
// Mirrors POST /api/upload from the Express backend app: the bytes go into
// Shopify's own Files storage (stagedUploadsCreate -> PUT -> fileCreate) and
// the resulting cdn.shopify.com URL comes back. Because it runs behind the
// proxy it is same-origin with the storefront and Shopify verifies the HMAC,
// so there is no CORS layer and no public unauthenticated endpoint.
//
// Differences from the Express version, both forced by the runtime:
//   - no multer; React Router parses multipart via request.formData()
//   - the Admin client comes from the proxy session rather than a static
//     SHOPIFY_ADMIN_ACCESS_TOKEN env var

// The Express app capped uploads at 10 MB. Gang sheet artwork is routinely
// larger, and the storefront hand-off already validates at 20 MB, so this
// matches the storefront rather than the original limit.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "application/illustrator",
  "application/postscript",
  "image/ai",
  "image/eps",
]);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// "My Logo (final).png" -> "My-Logo-final-1739_k3x9a1.png"
function buildStoredFileName(originalName) {
  const name = originalName || "upload";
  const lastDot = name.lastIndexOf(".");
  const hasExt = lastDot > 0;
  const base = hasExt ? name.slice(0, lastDot) : name;
  const ext = hasExt ? name.slice(lastDot).toLowerCase() : "";
  const safeName =
    base
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "upload";
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${safeName}-${suffix}${ext}`;
}


// Uploads raw bytes to Shopify Files and returns the CDN URL. Giving Shopify
// the exact bytes/content-type avoids the content-negotiation mismatches you
// get when handing it a third-party URL to fetch.
async function uploadBufferToShopifyFiles(gql, bytes, mimetype, fileName) {
  const resource = mimetype.startsWith("image/") ? "IMAGE" : "FILE";

  const stagedData = await gql(
    `#graphql
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }`,
    {
      input: [
        {
          filename: fileName,
          mimeType: mimetype,
          resource,
          fileSize: String(bytes.byteLength),
          httpMethod: "PUT",
        },
      ],
    },
  );

  const stageErrors = stagedData.stagedUploadsCreate.userErrors;
  if (stageErrors.length) {
    const err = new Error(stageErrors[0].message);
    err.statusCode = 400;
    throw err;
  }

  const target = stagedData.stagedUploadsCreate.stagedTargets[0];

  const uploadRes = await fetch(target.url, {
    method: "PUT",
    headers: {
      "Content-Type": mimetype,
      "Content-Length": String(bytes.byteLength),
    },
    body: bytes,
  });

  if (!uploadRes.ok) {
    const detail = await uploadRes.text().catch(() => "");
    const err = new Error(`Shopify staged upload failed (${uploadRes.status})`);
    err.statusCode = 502;
    err.detail = detail;
    throw err;
  }

  const fileData = await gql(
    `#graphql
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          ... on MediaImage  { image { url } }
          ... on GenericFile { url }
        }
        userErrors { field message }
      }
    }`,
    {
      files: [
        {
          contentType: resource,
          originalSource: target.resourceUrl,
          filename: fileName,
        },
      ],
    },
  );

  const fileErrors = fileData.fileCreate.userErrors;
  if (fileErrors.length) {
    const err = new Error(fileErrors[0].message);
    err.statusCode = 400;
    throw err;
  }

  const created = fileData.fileCreate.files[0];
  // fileCreate is async on Shopify's side: the CDN url can still be null on
  // the first read, in which case the staged resourceUrl is the usable handle.
  const url = created?.image?.url ?? created?.url ?? target.resourceUrl;
  return { url, resourceUrl: target.resourceUrl };
}

export const loader = async ({ request }) => {
  await authenticate.public.appProxy(request);
  return json({ message: "File upload endpoint — Shopify CDN" });
};

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }


  let gql;
  try {
    ({ graphql: gql } = await getProxyAdmin(request));
  } catch (error) {
    return json({ error: error?.message || "Unauthorized" }, error?.statusCode || 401);
  }

  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!file || typeof file === "string") {
      return json(
        { error: "No file provided. Send a multipart field named 'file'." },
        400,
      );
    }

    const mimetype = file.type || "application/octet-stream";
    if (!ALLOWED_MIME.has(mimetype)) {
      return json(
        {
          error:
            "File type not supported. Please upload an image (JPEG, PNG, GIF, WebP, SVG) or document (PDF, AI, EPS)",
        },
        415,
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return json(
        {
          error: `File too large. Maximum size is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
        },
        413,
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const fileName = buildStoredFileName(file.name);
    const { url, resourceUrl } = await uploadBufferToShopifyFiles(
      gql,
      bytes,
      mimetype,
      fileName,
    );

    return json({
      success: true,
      url,
      resourceUrl,
      fileName: file.name,
      fileSize: file.size,
      fileType: mimetype,
    });
  } catch (error) {
    return json(
      {
        error: error?.message || "Failed to upload file",
        ...(error?.detail ? { detail: error.detail } : {}),
      },
      error?.statusCode || 500,
    );
  }
};
