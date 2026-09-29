import { randomUUID } from "node:crypto";
import prisma from "~/db.server";
import {
  MARKETING_CONSENT_SOURCE,
  MARKETING_CONSENT_VERSION,
  validateMarketingEmail,
} from "~/models/marketing-consent";
import {
  deleteResendContact,
  sendMarketingWelcomeEmail,
  unsubscribeResendContact,
  upsertResendContact,
} from "~/models/resend.server";

export async function getMarketingSubscription(shop: string) {
  return prisma.marketingSubscription.findUnique({ where: { shop } });
}

export async function getMarketingSubscriptionByToken(token: string) {
  return prisma.marketingSubscription.findUnique({
    where: { unsubscribeToken: token },
  });
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
      unsubscribeToken: randomUUID(),
      resendSyncStatus: "NOT_SYNCED",
    },
    update: {
      email,
      status: "SUBSCRIBED",
      consentedAt,
      consentSource: MARKETING_CONSENT_SOURCE,
      consentVersion: MARKETING_CONSENT_VERSION,
      unsubscribedAt: null,
      unsubscribeToken: randomUUID(),
      resendSyncStatus: "NOT_SYNCED",
      resendSyncError: null,
    },
  });
}

export async function unsubscribeFromMarketing(shop: string) {
  return prisma.marketingSubscription.update({
    where: { shop },
    data: {
      status: "UNSUBSCRIBED",
      unsubscribedAt: new Date(),
      resendSyncStatus: "NOT_SYNCED",
      resendSyncError: null,
    },
  });
}

export async function syncMarketingSubscription(shop: string) {
  let subscription = await prisma.marketingSubscription.findUnique({
    where: { shop },
  });
  if (!subscription || subscription.status !== "SUBSCRIBED") {
    throw new Error("No active email subscription was found.");
  }

  if (!subscription.unsubscribeToken) {
    subscription = await prisma.marketingSubscription.update({
      where: { shop },
      data: { unsubscribeToken: randomUUID() },
    });
  }

  await prisma.marketingSubscription.update({
    where: { shop },
    data: { resendSyncStatus: "SYNCING", resendSyncError: null },
  });

  try {
    const contact = await upsertResendContact(subscription.email);
    const welcome = subscription.welcomeEmailSentAt
      ? null
      : await sendMarketingWelcomeEmail({
          email: subscription.email,
          shop,
          unsubscribeToken: subscription.unsubscribeToken!,
        });
    const now = new Date();

    await prisma.marketingSubscription.update({
      where: { shop },
      data: {
        resendContactId: contact.id,
        resendSyncStatus: "SYNCED",
        resendSyncError: null,
        resendSyncedAt: now,
        ...(welcome?.sent
          ? { welcomeEmailId: welcome.id, welcomeEmailSentAt: now }
          : {}),
      },
    });

    return {
      welcomeSent: welcome?.sent === true,
      welcomeSkipped: welcome?.reason === "POSTAL_ADDRESS_MISSING",
    };
  } catch (error) {
    await markMarketingSyncFailed(shop, error);
    throw error;
  }
}

export async function syncMarketingUnsubscribe(shop: string) {
  const subscription = await prisma.marketingSubscription.findUnique({
    where: { shop },
  });
  if (!subscription) return;

  try {
    await unsubscribeResendContact(subscription.email);
    await prisma.marketingSubscription.update({
      where: { shop },
      data: {
        resendSyncStatus: "SYNCED",
        resendSyncError: null,
        resendSyncedAt: new Date(),
      },
    });
  } catch (error) {
    await markMarketingSyncFailed(shop, error);
    throw error;
  }
}

export async function unsubscribeFromMarketingByToken(token: string) {
  const subscription = await prisma.marketingSubscription.findUnique({
    where: { unsubscribeToken: token },
  });
  if (!subscription) return null;

  const updated = await unsubscribeFromMarketing(subscription.shop);
  try {
    await syncMarketingUnsubscribe(subscription.shop);
  } catch {
    // Local opt-out remains authoritative if the provider is unavailable.
  }
  return updated;
}

export async function markMarketingUnsubscribedByEmail(email: string) {
  return prisma.marketingSubscription.updateMany({
    where: { email: email.toLowerCase() },
    data: {
      status: "UNSUBSCRIBED",
      unsubscribedAt: new Date(),
      resendSyncStatus: "SYNCED",
      resendSyncError: null,
      resendSyncedAt: new Date(),
    },
  });
}

async function markMarketingSyncFailed(shop: string, error: unknown) {
  await prisma.marketingSubscription.update({
    where: { shop },
    data: {
      resendSyncStatus: "FAILED",
      resendSyncError:
        error instanceof Error
          ? error.message
          : "Resend synchronization failed.",
    },
  });
}

export async function deleteMarketingSubscription(shop: string) {
  const subscription = await prisma.marketingSubscription.findUnique({
    where: { shop },
  });
  if (subscription) {
    try {
      await deleteResendContact(subscription.email);
    } catch (error) {
      console.error(`Could not remove Resend contact for ${shop}.`, error);
    }
  }
  return prisma.marketingSubscription.deleteMany({ where: { shop } });
}
