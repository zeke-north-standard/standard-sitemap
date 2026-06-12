import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { getSitemapState, markSitemapSyncFailed } from "~/models/sitemap.store.server";
import { syncSitemapForShop } from "~/models/sitemap.sync.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, shop, topic } = await authenticate.webhook(request);

  if (admin) {
    try {
      const state = await getSitemapState(shop);
      await syncSitemapForShop({ admin, shop, config: state.config });
    } catch (error) {
      await markSitemapSyncFailed(shop, error);
    }
  }

  console.log(`Received ${topic} webhook for ${shop}`);
  return new Response();
};
