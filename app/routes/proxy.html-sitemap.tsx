import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { renderSitemapLiquid } from "~/models/sitemap.render";
import { loadSnapshotForShop } from "~/models/sitemap.store.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const proxyContext = await authenticate.public.appProxy(request);
  const shop = proxyContext.session?.shop;

  if (!shop) {
    // A valid proxy signature does not mean the app is still installed.
    return new Response("Sitemap is unavailable.", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const snapshot = await loadSnapshotForShop(shop);
  return new Response(renderSitemapLiquid(snapshot), {
    headers: {
      "Content-Type": "application/liquid; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
    },
  });
};
