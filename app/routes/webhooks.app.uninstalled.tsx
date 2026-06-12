import type { ActionFunctionArgs } from "react-router";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  await prisma.session.deleteMany({ where: { shop } });
  await prisma.sitemapShop.deleteMany({ where: { shop } });

  console.log(`Received ${topic} webhook for ${shop}`);
  return new Response();
};
