import { createHash } from "node:crypto";
import type { MarketingSubscription, Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), findUnique: vi.fn(), getContact: vi.fn(), upsertContact: vi.fn(), unsubscribeContact: vi.fn(), welcome: vi.fn(), deleteContact: vi.fn(),
}));
vi.mock("~/db.server", () => ({ default: { $transaction: mocks.transaction, marketingSubscription: { findUnique: mocks.findUnique } } }));
vi.mock("~/models/resend.server", () => ({ getResendContact: mocks.getContact, upsertResendContact: mocks.upsertContact, unsubscribeResendContact: mocks.unsubscribeContact, sendMarketingWelcomeEmail: mocks.welcome, deleteResendContact: mocks.deleteContact }));

import { deleteMarketingSubscription, eraseMarketingSubscriptionInTransaction, markMarketingUnsubscribedByEmail, subscribeToMarketing, syncMarketingSubscription, syncMarketingUnsubscribe, unsubscribeFromMarketing, unsubscribeFromMarketingByToken } from "~/models/marketing-consent.server";

type Row = MarketingSubscription;
type Where = Record<string, unknown>;
type Update = { where: Where; data: Partial<Row> };
const A = "shop-a.myshopify.com";
const B = "shop-b.myshopify.com";
const EMAIL = "owner@example.com";
const OLD = "old-provider-id";
let rows: Map<string, Row>;
let contacts: Map<string, { email: string; unsubscribed: boolean }>;
let locks: Map<string, Promise<void>>;
let lockLog: string[][];
let transactionCount: number;
const key = (name: string) => createHash("sha256").update(name).digest("hex");

function row(shop = A, values: Partial<Row> = {}): Row {
  const now = new Date("2026-10-01T00:00:00Z");
  return {
    shop, email: EMAIL, status: "SUBSCRIBED", consentedAt: now, consentSource: "test", consentVersion: "test", unsubscribeToken: `token-${shop}`, unsubscribedAt: null,
    resendContactId: OLD, resendContactEmail: EMAIL, resendContactSyncedAt: now, resendErasurePending: false, resendErasureContactId: null, resendErasureEmail: null,
    resendSyncStatus: "SYNCED", resendSyncError: null, resendSyncedAt: now, welcomeEmailId: null, welcomeEmailSentAt: now, createdAt: now, updatedAt: now, ...values,
  };
}

function matches(record: Row, where: Where) {
  return Object.entries(where).every(([name, expected]) => {
    const actual = record[name as keyof Row];
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      const condition = expected as { in?: unknown[]; not?: unknown };
      if (condition.in) return condition.in.includes(actual);
      if ("not" in condition) return actual !== condition.not;
    }
    return actual === expected;
  });
}

// An isolated transactional fixture: writes become visible only at commit,
// keyed row locks are held through commit, and failed callbacks discard writes.
// Every provider call is mocked; this fixture performs no network/DB requests.
function memoryTransaction(work: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  const writes = new Map<string, Row | null>();
  const releases: Array<() => void> = [];
  const acquired: string[] = [];
  lockLog.push(acquired);
  transactionCount++;
  const currentRows = () => {
    const result = new Map(rows);
    writes.forEach((value, shop) => { if (value) result.set(shop, value); else result.delete(shop); });
    return [...result.values()];
  };
  const find = (where: Where) => currentRows().find(value => matches(value, where));
  const delegate = {
    findUnique: async ({ where }: { where: Where }) => structuredClone(find(where) ?? null),
    findUniqueOrThrow: async ({ where }: { where: Where }) => { const found = find(where); if (!found) throw new Error("Missing row"); return structuredClone(found); },
    findMany: async ({ where }: { where: Where }) => structuredClone(currentRows().filter(value => matches(value, where)).sort((a, b) => a.shop.localeCompare(b.shop))),
    update: async ({ where, data }: Update) => { const found = find(where); if (!found) throw new Error("Missing row"); const updated = { ...found, ...data }; writes.set(found.shop, updated); return structuredClone(updated); },
    updateMany: async ({ where, data }: Update) => { const found = currentRows().filter(value => matches(value, where)); found.forEach(value => writes.set(value.shop, { ...value, ...data })); return { count: found.length }; },
    deleteMany: async ({ where }: { where: Where }) => { const found = currentRows().filter(value => matches(value, where)); found.forEach(value => writes.set(value.shop, null)); return { count: found.length }; },
    upsert: async ({ where, create, update }: { where: Where; create: Partial<Row>; update: Partial<Row> }) => { const found = find(where); const value = found ? { ...found, ...update } : row(String(create.shop), { ...create, resendContactId: null, resendContactEmail: null, resendContactSyncedAt: null, welcomeEmailSentAt: null }); writes.set(value.shop, value); return structuredClone(value); },
  };
  const tx = { marketingSubscription: delegate, appOperationLock: { upsert: async ({ where }: { where: { id: string } }) => {
    const previous = locks.get(where.id) ?? Promise.resolve();
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    locks.set(where.id, previous.then(() => waiting));
    await previous;
    releases.push(release); acquired.push(where.id);
    return { id: where.id, version: 1 };
  } } } as unknown as Prisma.TransactionClient;
  return (async () => {
    try {
      const result = await work(tx);
      writes.forEach((value, shop) => { if (value) rows.set(shop, structuredClone(value)); else rows.delete(shop); });
      return result;
    } finally { releases.reverse().forEach(release => release()); }
  })();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks(); rows = new Map(); contacts = new Map(); locks = new Map(); lockLog = []; transactionCount = 0;
  mocks.transaction.mockImplementation(memoryTransaction);
  mocks.findUnique.mockImplementation(async ({ where }: { where: Where }) => structuredClone([...rows.values()].find(value => matches(value, where)) ?? null));
  mocks.getContact.mockImplementation(async (email: string) => { const found = [...contacts].find(([, value]) => value.email === email); return found ? { id: found[0] } : null; });
  mocks.deleteContact.mockImplementation(async (id: string) => { contacts.delete(id); });
  mocks.upsertContact.mockImplementation(async (email: string) => {
    const found = [...contacts].find(([, value]) => value.email === email);
    const id = found?.[0] ?? `new-id-${contacts.size}-${transactionCount}`;
    contacts.set(id, { email, unsubscribed: false }); return { id };
  });
  mocks.unsubscribeContact.mockImplementation(async (id: string) => { const contact = contacts.get(id); if (contact) contact.unsubscribed = true; });
  mocks.welcome.mockResolvedValue({ sent: false, reason: "POSTAL_ADDRESS_MISSING" });
});

describe("serialized marketing consent and provider generations", () => {
  it("retries an opted-out contact without reactivation or email", async () => {
    rows.set(A, row(A, { status: "UNSUBSCRIBED", resendSyncStatus: "FAILED" })); contacts.set(OLD, { email: EMAIL, unsubscribed: false });
    expect(await syncMarketingSubscription(A)).toEqual({ welcomeSent: false, welcomeSkipped: false });
    expect(mocks.unsubscribeContact).toHaveBeenCalledWith(OLD);
    expect(mocks.upsertContact).not.toHaveBeenCalled(); expect(mocks.welcome).not.toHaveBeenCalled();
    expect(rows.get(A)?.status).toBe("UNSUBSCRIBED"); expect(rows.get(A)?.resendSyncStatus).toBe("SYNCED");
  });

  it("commits local opt-out even when its provider request fails", async () => {
    rows.set(A, row()); mocks.unsubscribeContact.mockRejectedValue(new Error("Provider unavailable"));
    const result = await unsubscribeFromMarketingByToken(`token-${A}`);
    expect(result?.status).toBe("UNSUBSCRIBED"); expect(rows.get(A)?.status).toBe("UNSUBSCRIBED");
    expect(rows.get(A)?.resendSyncStatus).toBe("FAILED"); expect(mocks.upsertContact).not.toHaveBeenCalled();
  });

  it("does not create consent for an unknown shop", async () => {
    await expect(syncMarketingSubscription(A)).rejects.toThrow("No active email subscription");
    expect(mocks.upsertContact).not.toHaveBeenCalled(); expect(mocks.welcome).not.toHaveBeenCalled();
  });

  it("commits immutable retirement intent before the first DELETE dispatch", async () => {
    rows.set(A, row()); contacts.set(OLD, { email: EMAIL, unsubscribed: false });
    await expect(deleteMarketingSubscription(A)).rejects.toThrow("retirement is prepared");
    expect(rows.get(A)).toMatchObject({ status: "ERASURE_PENDING", resendErasurePending: true, resendErasureContactId: OLD, resendErasureEmail: EMAIL });
    expect(mocks.deleteContact).not.toHaveBeenCalled();
    mocks.deleteContact.mockImplementationOnce(async (id: string) => {
      expect(rows.get(A)?.resendErasureContactId).toBe(id); // committed, not merely TX-local
      contacts.delete(id);
    });
    await expect(deleteMarketingSubscription(A)).resolves.toEqual({ count: 1 });
    expect(rows.has(A)).toBe(false); expect(contacts.has(OLD)).toBe(false);
  });

  it("keeps durable ID on failed erasure and completes an idempotent retry", async () => {
    rows.set(A, row(A, { resendErasurePending: true, resendErasureEmail: EMAIL, resendErasureContactId: OLD }));
    mocks.deleteContact.mockRejectedValueOnce(new Error("Provider timeout"));
    await expect(deleteMarketingSubscription(A)).rejects.toThrow("Provider timeout");
    expect(rows.get(A)?.resendErasureContactId).toBe(OLD);
    await deleteMarketingSubscription(A);
    expect(mocks.deleteContact.mock.calls.map(call => call[0])).toEqual([OLD, OLD]); expect(rows.has(A)).toBe(false);
  });

  it("does not contact the provider for an already erased shop", async () => {
    await deleteMarketingSubscription(A);
    expect(mocks.getContact).not.toHaveBeenCalled(); expect(mocks.deleteContact).not.toHaveBeenCalled();
  });

  it("waits for an in-flight sync before applying a newer opt-out", async () => {
    rows.set(A, row()); const request = deferred<{ id: string }>(); const entered = deferred<void>();
    mocks.upsertContact.mockImplementationOnce(async () => { entered.resolve(); return request.promise; });
    const sync = syncMarketingSubscription(A); await entered.promise;
    let optedOut = false; const optOut = unsubscribeFromMarketing(A).then(() => { optedOut = true; });
    await Promise.resolve(); expect(optedOut).toBe(false);
    request.resolve({ id: OLD }); await sync; await optOut; await syncMarketingUnsubscribe(A);
    expect(rows.get(A)?.status).toBe("UNSUBSCRIBED"); expect(mocks.unsubscribeContact).toHaveBeenCalledWith(OLD);
  });

  it.each([EMAIL, "new-owner@example.com"])("a timed-out old DELETE cannot erase new consent for %s", async (newEmail) => {
    rows.set(A, row(A, { resendErasurePending: true, resendErasureEmail: EMAIL, resendErasureContactId: OLD })); contacts.set(OLD, { email: EMAIL, unsubscribed: false });
    const request = deferred<void>(); const entered = deferred<void>();
    mocks.deleteContact.mockImplementationOnce(async () => { entered.resolve(); return request.promise; });
    const cleanup = deleteMarketingSubscription(A).catch(error => error); await entered.promise;
    const subscribe = subscribeToMarketing(A, newEmail);
    request.reject(new Error("Provider timeout")); await cleanup; await subscribe;
    expect(rows.get(A)?.resendErasureContactId).toBe(OLD);
    await syncMarketingSubscription(A);
    const replacement = rows.get(A)!.resendContactId!;
    expect(replacement).not.toBe(OLD); expect(contacts.has(replacement)).toBe(true);
    contacts.delete(OLD); // The first request finishes remotely after the lock was released.
    expect(contacts.has(replacement)).toBe(true); expect(rows.get(A)?.status).toBe("SUBSCRIBED");
    expect(mocks.deleteContact.mock.calls.every(call => call[0] === OLD)).toBe(true);
  });

  it("preserves another shop's confirmed live contact", async () => {
    rows.set(A, row()); rows.set(B, row(B)); contacts.set(OLD, { email: EMAIL, unsubscribed: false });
    await deleteMarketingSubscription(A);
    expect(rows.has(A)).toBe(false); expect(rows.get(B)?.status).toBe("SUBSCRIBED");
    expect(contacts.has(OLD)).toBe(true); expect(mocks.deleteContact).not.toHaveBeenCalled();
  });

  it("does not discard pending retirement for another shop's fresh unsynchronized consent", async () => {
    rows.set(A, row(A, { resendErasurePending: true, resendErasureEmail: EMAIL, resendErasureContactId: OLD })); contacts.set(OLD, { email: EMAIL, unsubscribed: false });
    mocks.deleteContact.mockRejectedValueOnce(new Error("Provider timeout"));
    await expect(deleteMarketingSubscription(A)).rejects.toThrow("Provider timeout");
    await subscribeToMarketing(B, EMAIL);
    expect(rows.get(B)?.resendContactSyncedAt).toBeNull(); expect(rows.get(A)?.resendErasureContactId).toBe(OLD);
    await deleteMarketingSubscription(A); await syncMarketingSubscription(B);
    const replacement = rows.get(B)!.resendContactId!;
    expect(replacement).not.toBe(OLD); contacts.delete(OLD); expect(contacts.has(replacement)).toBe(true);
    expect(mocks.deleteContact.mock.calls.map(call => call[0])).toEqual([OLD, OLD]);
  });

  it("retires every pending old ID for an email before activating its replacement", async () => {
    rows.set(A, row(A, { resendErasurePending: true, resendErasureEmail: EMAIL, resendErasureContactId: OLD }));
    rows.set(B, row(B, { resendErasurePending: true, resendErasureEmail: EMAIL, resendErasureContactId: "older-id", resendContactId: "older-id" }));
    const C = "shop-c.myshopify.com"; await subscribeToMarketing(C, EMAIL);
    mocks.upsertContact.mockImplementationOnce(async (email) => { expect(mocks.deleteContact.mock.calls.map(call => call[0])).toEqual([OLD, "older-id"]); return { id: `fresh-${email.length}` }; });
    await syncMarketingSubscription(C);
    expect(rows.get(C)?.resendContactId).toBe("fresh-17");
  });

  it("ignores a retired-ID deletion callback after replacement sync", async () => {
    rows.set(A, row(A, { resendContactId: "new-id" }));
    expect(await markMarketingUnsubscribedByEmail(EMAIL, OLD)).toEqual({ count: 0 });
    expect(rows.get(A)?.status).toBe("SUBSCRIBED");
    expect(await markMarketingUnsubscribedByEmail(EMAIL, "new-id")).toEqual({ count: 1 });
    expect(rows.get(A)?.status).toBe("UNSUBSCRIBED");
    expect(lockLog.every(transaction => transaction.length === 1 && transaction[0] === key(`marketing-email:${EMAIL}`))).toBe(true);
  });

  it("takes shop then sorted distinct email locks when changing address", async () => {
    rows.set(A, row(A, { email: "z@example.com", resendContactEmail: "z@example.com", resendErasureEmail: "m@example.com", resendErasurePending: true }));
    await subscribeToMarketing(A, "a@example.com");
    expect(lockLog[0]).toEqual([key(`shop:${A}`), ...["a@example.com", "m@example.com", "z@example.com"].map(email => key(`marketing-email:${email}`))]);
    expect(rows.get(A)?.resendErasurePending).toBe(true);
  });

  it("does not apply an old-ID callback to a fresh local consent awaiting activation", async () => {
    rows.set(A, row());
    await subscribeToMarketing(A, EMAIL);
    expect(rows.get(A)?.resendContactId).toBe(OLD);
    expect(await markMarketingUnsubscribedByEmail(EMAIL, OLD)).toEqual({ count: 0 });
    expect(rows.get(A)?.status).toBe("SUBSCRIBED");
  });

  it("returns a committed retry result for lifecycle cleanup instead of throwing inside TX", async () => {
    rows.set(A, row()); contacts.set(OLD, { email: EMAIL, unsubscribed: false });
    const result = await mocks.transaction((tx: Prisma.TransactionClient) => eraseMarketingSubscriptionInTransaction(tx, A));
    expect(result).toMatchObject({ status: "retry", prepared: true });
    expect(rows.get(A)?.resendErasureContactId).toBe(OLD); expect(mocks.deleteContact).not.toHaveBeenCalled();
  });

  it("resolves a legacy ID's actual old email before retiring under its lock", async () => {
    rows.set(A, row(A, { email: "new-owner@example.com", resendContactEmail: null, resendContactSyncedAt: null }));
    contacts.set(OLD, { email: EMAIL, unsubscribed: false });
    mocks.getContact.mockImplementation(async (identifier) => identifier === OLD ? { id: OLD, email: EMAIL } : null);
    await syncMarketingSubscription(A);
    expect(rows.get(A)?.email).toBe("new-owner@example.com");
    expect(rows.get(A)?.resendContactId).not.toBe(OLD);
    expect(mocks.deleteContact).toHaveBeenCalledWith(OLD);
    expect(lockLog[1]).toEqual([key(`shop:${A}`), ...["new-owner@example.com", EMAIL].sort().map(email => key(`marketing-email:${email}`))]);
  });

  it("does not erase another shop's live legacy contact after resolving its old email", async () => {
    rows.set(A, row(A, { email: "new-owner@example.com", resendContactEmail: null, resendContactSyncedAt: null }));
    rows.set(B, row(B));
    mocks.getContact.mockResolvedValue({ id: OLD, email: EMAIL });
    await expect(deleteMarketingSubscription(A)).rejects.toThrow("retirement is prepared");
    expect(rows.get(A)?.resendContactEmail).toBe(EMAIL);
    await deleteMarketingSubscription(A);
    expect(rows.has(A)).toBe(false); expect(rows.has(B)).toBe(true);
    expect(mocks.deleteContact).not.toHaveBeenCalled();
  });

  it("never looks up a replacement by email when a legacy immutable ID is already gone", async () => {
    rows.set(A, row(A, { resendContactEmail: null }));
    mocks.getContact.mockResolvedValue(null);
    await deleteMarketingSubscription(A);
    expect(mocks.getContact).toHaveBeenCalledExactlyOnceWith(OLD);
    expect(mocks.deleteContact).not.toHaveBeenCalled();
  });
});
