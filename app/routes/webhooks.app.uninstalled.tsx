import type { ActionFunctionArgs } from "react-router";
import prisma from "~/db.server";
import { deleteMarketingSubscription } from "~/models/marketing-consent.server";
import { authenticateCleanupWebhook } from "~/webhook-auth.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticateCleanupWebhook(request, [
    "APP_UNINSTALLED",
  ]);

  await Promise.all([
    prisma.session.deleteMany({ where: { shop } }),
    prisma.sitemapShop.deleteMany({ where: { shop } }),
    deleteMarketingSubscription(shop),
  ]);

  console.log(`Received ${topic} webhook for ${shop}`);
  return new Response();
};
