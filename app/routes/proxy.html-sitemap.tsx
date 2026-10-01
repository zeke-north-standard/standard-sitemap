import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { renderSitemapLiquid } from "~/models/sitemap.render";
import { loadSnapshotForShop } from "~/models/sitemap.store.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const proxyContext = await authenticate.public.appProxy(request);
  const context = proxyContext as { session?: { shop?: string } };
  const shop =
    context.session?.shop ?? new URL(request.url).searchParams.get("shop");

  if (!shop) {
    return new Response("Missing shop.", { status: 400 });
  }

  const snapshot = await loadSnapshotForShop(shop);
  return new Response(renderSitemapLiquid(snapshot), {
    headers: {
      "Content-Type": "application/liquid; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
    },
  });
};
