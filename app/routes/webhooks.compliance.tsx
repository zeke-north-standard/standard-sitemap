import type { ActionFunctionArgs } from "react-router";
import prisma from "~/db.server";
import { deleteMarketingSubscription } from "~/models/marketing-consent.server";
import { authenticateCleanupWebhook } from "~/webhook-auth.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticateCleanupWebhook(request, [
    "CUSTOMERS_DATA_REQUEST",
    "CUSTOMERS_REDACT",
    "SHOP_REDACT",
  ]);

  if (String(topic) === "SHOP_REDACT") {
    await Promise.all([
      prisma.session.deleteMany({ where: { shop } }),
      prisma.sitemapShop.deleteMany({ where: { shop } }),
      deleteMarketingSubscription(shop),
    ]);
  }

  console.log(`Processed ${topic} compliance webhook for ${shop}`);
  return new Response(null, { status: 200 });
};
