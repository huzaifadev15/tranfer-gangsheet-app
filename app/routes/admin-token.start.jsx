import { redirect } from "react-router";
import { buildAuthorizeUrl } from "../lib/adminToken.server";

// Step 1 of the one-off token flow: bounce the merchant to Shopify's OAuth
// consent screen. Reached from the home page form.
//
// This is intentionally separate from the library's own /auth routes: those
// complete a normal install and stash the session in MemorySessionStorage,
// which is exactly the thing that does not survive on serverless. Here the goal
// is to surface the offline token itself so it can be pasted into the env.
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  return redirect(buildAuthorizeUrl(url.searchParams.get("shop")));
};
