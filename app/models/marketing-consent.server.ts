import { randomUUID } from "node:crypto";
import type { MarketingSubscription, Prisma } from "@prisma/client";
import prisma from "~/db.server";
import { lockOperation, withShopOperationLock } from "~/services/shop-lifecycle.server";
import { MARKETING_CONSENT_SOURCE, MARKETING_CONSENT_VERSION, validateMarketingEmail } from "~/models/marketing-consent";
import { deleteResendContact, getResendContact, sendMarketingWelcomeEmail, unsubscribeResendContact, upsertResendContact } from "~/models/resend.server";

type Transaction = Prisma.TransactionClient;
type SyncResult = { welcomeSent: boolean; welcomeSkipped: boolean };
type Outcome<T> = { ok: true; value: T } | { ok: false; error: Error; prepared?: boolean };
export type MarketingErasureResult = { status: "erased" } | { status: "retry"; message: string; prepared?: boolean };
const NO_WELCOME: SyncResult = { welcomeSent: false, welcomeSkipped: false };

class RetirementPrepared extends Error {
  constructor() { super("Previous contact retirement is prepared. Retry synchronization to finish it."); }
}

function errorValue(error: unknown) {
  return error instanceof Error ? error : new Error("Email synchronization could not finish. Please retry.");
}

function subscriptionEmails(subscription: MarketingSubscription) {
  return [...new Set([subscription.email, subscription.resendContactEmail, subscription.resendErasureEmail].filter((email): email is string => Boolean(email)))].sort();
}

async function lockEmails(tx: Transaction, emails: string[]) {
  for (const email of [...new Set(emails)].sort()) await lockOperation(tx, `marketing-email:${email}`);
}

async function loadLockedSubscription(tx: Transaction, shop: string) {
  const initial = await tx.marketingSubscription.findUnique({ where: { shop } });
  if (!initial) return null;
  await lockEmails(tx, subscriptionEmails(initial));
  // Provider callbacks use the email lock alone, so reread after acquiring it.
  return tx.marketingSubscription.findUnique({ where: { shop } });
}

export async function getMarketingSubscription(shop: string) {
  return prisma.marketingSubscription.findUnique({ where: { shop } });
}

export async function getMarketingSubscriptionByToken(token: string) {
  return prisma.marketingSubscription.findUnique({ where: { unsubscribeToken: token } });
}

export async function subscribeToMarketing(shop: string, value: unknown) {
  const email = validateMarketingEmail(value);
  return withShopOperationLock(prisma, shop, async (tx) => {
    const previous = await tx.marketingSubscription.findUnique({ where: { shop } });
    await lockEmails(tx, [...(previous ? subscriptionEmails(previous) : []), email]);
    const consentedAt = new Date();
    return tx.marketingSubscription.upsert({
      where: { shop },
      create: { shop, email, status: "SUBSCRIBED", consentedAt, consentSource: MARKETING_CONSENT_SOURCE, consentVersion: MARKETING_CONSENT_VERSION, unsubscribeToken: randomUUID(), resendSyncStatus: "NOT_SYNCED" },
      update: {
        email, status: "SUBSCRIBED", consentedAt, consentSource: MARKETING_CONSENT_SOURCE, consentVersion: MARKETING_CONSENT_VERSION,
        unsubscribedAt: null, unsubscribeToken: randomUUID(), resendSyncStatus: "NOT_SYNCED", resendSyncError: null,
        resendContactSyncedAt: null,
        ...(previous && previous.email !== email ? { welcomeEmailId: null, welcomeEmailSentAt: null } : {}),
        // Keep any pending ID and old email until confirmed retirement.
      },
    });
  });
}

function optOutData() {
  return { status: "UNSUBSCRIBED", unsubscribedAt: new Date(), resendContactSyncedAt: null, resendSyncStatus: "NOT_SYNCED", resendSyncError: null };
}

export async function unsubscribeFromMarketing(shop: string) {
  return withShopOperationLock(prisma, shop, async (tx) => {
    await loadLockedSubscription(tx, shop);
    return tx.marketingSubscription.update({ where: { shop }, data: optOutData() });
  });
}

const clearPending = { resendErasurePending: false, resendErasureEmail: null, resendErasureContactId: null };
const clearContact = { resendContactId: null, resendContactEmail: null, resendContactSyncedAt: null };

// A pending ID was committed by a previous transaction BEFORE any DELETE is
// dispatched. Neither a timeout nor process termination can remove that fence.
async function retirePendingContacts(tx: Transaction, emails: string[]) {
  const pending = await tx.marketingSubscription.findMany({
    where: { resendErasurePending: true, resendErasureEmail: { in: emails } }, orderBy: { shop: "asc" },
  });
  const seen = new Set<string>();
  let retired = 0;
  for (const record of pending) {
    const email = record.resendErasureEmail!;
    let id = record.resendErasureContactId;
    const key = `${email}:${id ?? "unresolved"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (retired === 2) throw new Error("More previous contacts need retirement. Retry synchronization to continue.");
    if (!id) {
      const contact = await getResendContact(email);
      if (!contact) {
        await tx.marketingSubscription.updateMany({ where: { resendErasurePending: true, resendErasureEmail: email, resendErasureContactId: null }, data: clearPending });
        continue;
      }
      id = contact.id;
      if (await hasAnotherLiveContact(tx, record.shop, email, id)) {
        // An unresolved intent has never dispatched DELETE. Preserve a
        // different shop's already-confirmed active contact.
        await tx.marketingSubscription.updateMany({ where: { resendErasurePending: true, resendErasureEmail: email, resendErasureContactId: null }, data: clearPending });
        continue;
      }
      await tx.marketingSubscription.updateMany({ where: { resendErasurePending: true, resendErasureEmail: email, resendErasureContactId: null }, data: { resendErasureContactId: id } });
      throw new RetirementPrepared();
    }
    await deleteResendContact(id);
    await tx.marketingSubscription.updateMany({ where: { resendContactId: id, resendContactEmail: email }, data: clearContact });
    await tx.marketingSubscription.updateMany({ where: { resendErasurePending: true, resendErasureEmail: email, resendErasureContactId: id }, data: clearPending });
    retired++;
  }
}

async function hasAnotherLiveContact(tx: Transaction, shop: string, email: string, id: string) {
  const others = await tx.marketingSubscription.findMany({
    where: { shop: { not: shop }, email, status: "SUBSCRIBED", resendContactId: id, resendContactEmail: email, resendContactSyncedAt: { not: null } },
  });
  return others.some(other => other.resendContactSyncedAt!.getTime() >= other.consentedAt.getTime());
}

// Stage only. The caller must commit, then retry in a NEW transaction.
async function prepareContactRetirement(tx: Transaction, subscription: MarketingSubscription) {
  if (subscription.resendContactId && !subscription.resendContactEmail) {
    const contact = await getResendContact(subscription.resendContactId);
    if (!contact) {
      await tx.marketingSubscription.update({ where: { shop: subscription.shop }, data: { ...clearPending, ...clearContact } });
      return;
    }
    if (!contact.email) throw new Error("The previous provider contact email could not be verified. Retry cleanup.");
    const verifiedEmail = validateMarketingEmail(contact.email);
    await tx.marketingSubscription.update({ where: { shop: subscription.shop }, data: { resendContactEmail: verifiedEmail } });
    // Commit metadata first; the next transaction locks this actual old email
    // in sorted order before staging or dispatching any destructive request.
    throw new RetirementPrepared();
  }
  const email = subscription.resendContactEmail ?? subscription.email;
  let id = subscription.resendContactId;
  if (!id) {
    await tx.marketingSubscription.update({ where: { shop: subscription.shop }, data: { resendErasurePending: true, resendErasureEmail: email, resendErasureContactId: null } });
    id = (await getResendContact(email))?.id ?? null;
  }
  if (!id || await hasAnotherLiveContact(tx, subscription.shop, email, id)) {
    await tx.marketingSubscription.update({ where: { shop: subscription.shop }, data: { ...clearPending, ...clearContact } });
    return;
  }
  await tx.marketingSubscription.update({ where: { shop: subscription.shop }, data: { resendErasurePending: true, resendErasureEmail: email, resendErasureContactId: id, resendContactSyncedAt: null } });
  throw new RetirementPrepared();
}

async function markSyncFailed(tx: Transaction, shop: string, error: Error) {
  await tx.marketingSubscription.update({ where: { shop }, data: { resendSyncStatus: "FAILED", resendSyncError: error.message } });
}

async function syncOptOut(tx: Transaction, subscription: MarketingSubscription) {
  if (subscription.status !== "UNSUBSCRIBED") return;
  await retirePendingContacts(tx, subscriptionEmails(subscription));
  const current = await tx.marketingSubscription.findUniqueOrThrow({ where: { shop: subscription.shop } });
  const id = current.resendContactEmail === current.email && current.resendContactId
    ? current.resendContactId : (await getResendContact(current.email))?.id;
  if (id) await unsubscribeResendContact(id);
  await tx.marketingSubscription.update({ where: { shop: current.shop }, data: { resendContactId: id ?? null, resendContactEmail: id ? current.email : null, resendContactSyncedAt: null, resendSyncStatus: "SYNCED", resendSyncError: null, resendSyncedAt: new Date() } });
}

async function syncSubscriptionTransaction(tx: Transaction, shop: string): Promise<Outcome<SyncResult>> {
  const subscription = await loadLockedSubscription(tx, shop);
  if (!subscription) return { ok: false, error: new Error("No active email subscription was found.") };
  try {
    if (subscription.status === "UNSUBSCRIBED") {
      await syncOptOut(tx, subscription);
      return { ok: true, value: NO_WELCOME };
    }
    if (subscription.status !== "SUBSCRIBED") throw new Error("No active email subscription was found.");
    await retirePendingContacts(tx, subscriptionEmails(subscription));
    let current = await tx.marketingSubscription.findUniqueOrThrow({ where: { shop } });
    if (current.resendContactId && !current.resendContactEmail) {
      await prepareContactRetirement(tx, current);
      current = await tx.marketingSubscription.findUniqueOrThrow({ where: { shop } });
    }
    if (current.resendContactId && current.resendContactEmail && current.resendContactEmail !== current.email) {
      await prepareContactRetirement(tx, current);
      current = await tx.marketingSubscription.findUniqueOrThrow({ where: { shop } });
    }
    if (!current.unsubscribeToken) current = await tx.marketingSubscription.update({ where: { shop }, data: { unsubscribeToken: randomUUID() } });
    await tx.marketingSubscription.update({ where: { shop }, data: { resendSyncStatus: "SYNCING", resendSyncError: null } });
    const contact = await upsertResendContact(current.email);
    await tx.marketingSubscription.update({ where: { shop }, data: { resendContactId: contact.id, resendContactEmail: current.email, resendContactSyncedAt: new Date() } });
    const welcome = current.welcomeEmailSentAt ? null : await sendMarketingWelcomeEmail({ email: current.email, shop, unsubscribeToken: current.unsubscribeToken! });
    const now = new Date();
    await tx.marketingSubscription.update({ where: { shop }, data: { resendSyncStatus: "SYNCED", resendSyncError: null, resendSyncedAt: now, ...(welcome?.sent ? { welcomeEmailId: welcome.id, welcomeEmailSentAt: now } : {}) } });
    return { ok: true, value: { welcomeSent: welcome?.sent === true, welcomeSkipped: welcome?.reason === "POSTAL_ADDRESS_MISSING" } };
  } catch (error) {
    const failure = errorValue(error);
    await markSyncFailed(tx, shop, failure);
    return { ok: false, error: failure, prepared: error instanceof RetirementPrepared };
  }
}

export async function syncMarketingSubscription(shop: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await withShopOperationLock(prisma, shop, tx => syncSubscriptionTransaction(tx, shop), { timeoutMs: 10_000 });
    if (result.ok) return result.value;
    if (!result.prepared || attempt === 2) throw result.error;
  }
  throw new Error("Email synchronization needs a retry.");
}

export async function syncMarketingUnsubscribe(shop: string) {
  const result = await withShopOperationLock(prisma, shop, async (tx): Promise<Outcome<void>> => {
    const subscription = await loadLockedSubscription(tx, shop);
    if (!subscription || subscription.status !== "UNSUBSCRIBED") return { ok: true, value: undefined };
    try { await syncOptOut(tx, subscription); return { ok: true, value: undefined }; }
    catch (error) { const failure = errorValue(error); await markSyncFailed(tx, shop, failure); return { ok: false, error: failure }; }
  });
  if (!result.ok) throw result.error;
}

export async function unsubscribeFromMarketingByToken(token: string) {
  const initial = await getMarketingSubscriptionByToken(token);
  if (!initial) return null;
  return withShopOperationLock(prisma, initial.shop, async (tx) => {
    const current = await loadLockedSubscription(tx, initial.shop);
    if (!current || current.unsubscribeToken !== token) return null;
    const updated = await tx.marketingSubscription.update({ where: { shop: current.shop }, data: optOutData() });
    try { await syncOptOut(tx, updated); }
    catch (error) { await markSyncFailed(tx, current.shop, errorValue(error)); }
    return updated;
  });
}

export async function markMarketingUnsubscribedByEmail(value: string, id: string) {
  const email = validateMarketingEmail(value);
  // Never acquire a shop lock after an email lock.
  return prisma.$transaction(async (tx) => {
    await lockEmails(tx, [email]);
    const matching = await tx.marketingSubscription.findMany({ where: { email, resendContactId: id, resendContactSyncedAt: { not: null } } });
    const shops = matching.filter(record => record.resendContactSyncedAt!.getTime() >= record.consentedAt.getTime()).map(record => record.shop);
    return tx.marketingSubscription.updateMany({ where: { shop: { in: shops }, email, resendContactId: id }, data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date(), resendContactSyncedAt: null, resendSyncStatus: "SYNCED", resendSyncError: null, resendSyncedAt: new Date() } });
  }, { isolationLevel: "Serializable", maxWait: 500, timeout: 10_000 });
}

/** Call once inside a NEW shop-locked transaction. Handle retry AFTER commit;
 * a prepared ID is never deleted in its staging transaction. */
export async function eraseMarketingSubscriptionInTransaction(tx: Transaction, shop: string): Promise<MarketingErasureResult> {
  let subscription = await loadLockedSubscription(tx, shop);
  if (!subscription) return { status: "erased" };
  try {
    const hadPending = subscription.resendErasurePending;
    await retirePendingContacts(tx, subscriptionEmails(subscription));
    subscription = await tx.marketingSubscription.findUniqueOrThrow({ where: { shop } });
    // Never look up a fresh generation by email after retiring the pending ID.
    if (!hadPending || subscription.resendContactId) await prepareContactRetirement(tx, subscription);
    await tx.marketingSubscription.deleteMany({ where: { shop } });
    return { status: "erased" };
  } catch (error) {
    const failure = errorValue(error);
    await tx.marketingSubscription.update({ where: { shop }, data: { status: "ERASURE_PENDING", resendContactSyncedAt: null, resendSyncStatus: "FAILED", resendSyncError: failure.message } });
    return { status: "retry", message: failure.message, prepared: error instanceof RetirementPrepared };
  }
}

export async function deleteMarketingSubscription(shop: string) {
  const result = await withShopOperationLock(prisma, shop, tx => eraseMarketingSubscriptionInTransaction(tx, shop));
  if (result.status === "retry") throw new Error(result.message);
  return { count: 1 };
}
