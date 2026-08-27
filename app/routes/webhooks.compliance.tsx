import type { ActionFunctionArgs } from "react-router";
import prisma from "~/db.server";
import { deleteMarketingSubscription } from "~/models/marketing-consent.server";
import { authenticate } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

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
