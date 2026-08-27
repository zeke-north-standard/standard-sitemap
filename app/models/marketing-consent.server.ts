import prisma from "~/db.server";
import {
  MARKETING_CONSENT_SOURCE,
  MARKETING_CONSENT_VERSION,
  validateMarketingEmail,
} from "~/models/marketing-consent";

export async function getMarketingSubscription(shop: string) {
  return prisma.marketingSubscription.findUnique({ where: { shop } });
}

export async function subscribeToMarketing(shop: string, value: unknown) {
  const email = validateMarketingEmail(value);
  const consentedAt = new Date();

  return prisma.marketingSubscription.upsert({
    where: { shop },
    create: {
      shop,
      email,
      status: "SUBSCRIBED",
      consentedAt,
      consentSource: MARKETING_CONSENT_SOURCE,
      consentVersion: MARKETING_CONSENT_VERSION,
    },
    update: {
      email,
      status: "SUBSCRIBED",
      consentedAt,
      consentSource: MARKETING_CONSENT_SOURCE,
      consentVersion: MARKETING_CONSENT_VERSION,
      unsubscribedAt: null,
    },
  });
}

export async function unsubscribeFromMarketing(shop: string) {
  return prisma.marketingSubscription.updateMany({
    where: { shop, status: "SUBSCRIBED" },
    data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() },
  });
}

export async function deleteMarketingSubscription(shop: string) {
  return prisma.marketingSubscription.deleteMany({ where: { shop } });
}
