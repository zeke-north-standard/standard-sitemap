import type { ActionFunctionArgs } from "react-router";
import prisma from "~/db.server";
import { cleanupShopLifecycle, LifecycleUnavailableError } from "~/services/shop-lifecycle.server";
import { authenticateCleanupWebhook } from "~/webhook-auth.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticateCleanupWebhook(request, [
    "CUSTOMERS_DATA_REQUEST",
    "CUSTOMERS_REDACT",
    "SHOP_REDACT",
  ]);

  if (String(topic) === "SHOP_REDACT") {
    try {
      await cleanupShopLifecycle(prisma, shop);
    } catch (error) {
      if (!(error instanceof LifecycleUnavailableError)) throw error;
      return new Response(null, { status: 503, headers: { "Retry-After": "30" } });
    }
  }

  console.log(`Processed ${topic} compliance webhook for ${shop}`);
  return new Response(null, { status: 200 });
};
