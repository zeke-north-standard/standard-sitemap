import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { Session } from "@shopify/shopify-api";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { getLifecycleApi, lifecycleCredentialFingerprint } from "./cleanup-webhook.server";
import { eraseMarketingSubscriptionInTransaction } from "../models/marketing-consent.server";

export const CURRENT_INSTALLATION_QUERY = `#graphql
  query SitemapCurrentInstallation { currentAppInstallation { id } }
`;
const API_TIMEOUT_MS = 1500;
const REFRESH_WINDOW_MS = 5 * 60_000;
const OPERATION_TIMEOUT_MS = 4500;
const SHOP_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export class LifecycleUnavailableError extends Error {
  readonly status = 503;
  constructor(readonly reason = "VERIFICATION_UNAVAILABLE") { super("Shopify installation could not be verified. Please try again."); }
}

function staleSessionError() {
  return new Response("Your Shopify session changed. Please reload the app.", {
    status: 401, headers: { "X-Shopify-Retry-Invalid-Session-Request": "1" },
  });
}

function requireShop(shop: string) {
  if (!SHOP_PATTERN.test(shop)) throw new LifecycleUnavailableError();
}

type Transaction = Prisma.TransactionClient;
export type LifecycleAuthority = {
  probe(session: Session): Promise<"active" | "revoked">;
  credentialFingerprint(): string;
  requiredScopes?(): string[];
};

function operationId(key: string) { return createHash("sha256").update(key).digest("hex"); }

// Generic namespaced keys also support sorted email locks inside this transaction.
export async function lockOperation(tx: Transaction, namespacedKey: string) {
  const id = operationId(namespacedKey);
  return tx.appOperationLock.upsert({ where: { id }, create: { id }, update: { version: { increment: 1 } } });
}

export async function withShopOperationLock<T>(database: PrismaClient, shop: string, work: (tx: Transaction) => Promise<T>, options: { timeoutMs?: number } = {}): Promise<T> {
  requireShop(shop);
  const deadline = Date.now() + Math.min(10_000, Math.max(OPERATION_TIMEOUT_MS, options.timeoutMs ?? OPERATION_TIMEOUT_MS));
  for (let attempt = 0; attempt < 3; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 100) throw new LifecycleUnavailableError();
    try {
      return await database.$transaction(async (tx) => {
        await lockOperation(tx, `shop:${shop}`);
        return work(tx);
      }, { isolationLevel: "Serializable", maxWait: Math.min(500, remaining), timeout: remaining });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      if (!["P2034", "P2002", "P1008"].includes(String(code)) || attempt === 2) throw error;
    }
  }
  throw new LifecycleUnavailableError();
}

function httpStatus(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const response = "response" in error ? error.response as { code?: number; status?: number } | undefined : undefined;
  return response?.code ?? response?.status;
}

export const shopifyLifecycleAuthority: LifecycleAuthority = {
  credentialFingerprint: lifecycleCredentialFingerprint,
  requiredScopes: () => ["write_app_proxy", "read_online_store_navigation", "read_products", "read_content"],
  async probe(session) {
    try {
      const client = new (getLifecycleApi().clients.Graphql)({ session });
      const result = await client.request<{ currentAppInstallation?: { id?: string } }>(CURRENT_INSTALLATION_QUERY, {
        retries: 0, signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      if (!result.data?.currentAppInstallation?.id) throw new LifecycleUnavailableError();
      return "active";
    } catch (error) {
      if (httpStatus(error) === 401) return "revoked";
      throw new LifecycleUnavailableError();
    }
  },
};

function transactionStorage(tx: Transaction) {
  // The official adapter only needs the Session delegate on this client.
  return new PrismaSessionStorage(tx as unknown as PrismaClient);
}

async function markVerified(tx: Transaction, shop: string, authority: LifecycleAuthority) {
  await tx.appOperationLock.update({ where: { id: operationId(`shop:${shop}`) }, data: {
    credentialFingerprint: authority.credentialFingerprint(), reauthRequired: false,
  } });
}

async function recordCleanupStatus(tx: Transaction, shop: string, status: string) {
  await tx.appOperationLock.update({ where: { id: operationId(`shop:${shop}`) }, data: {
    lastCleanupStatus: status, lastCleanupAt: new Date(),
  } });
}

async function resolveSession(session: Session, authority: LifecycleAuthority) {
  requireShop(session.shop);
  const requiredScopes = authority.requiredScopes?.() ?? [];
  if (requiredScopes.length && !session.isScopeIncluded(requiredScopes)) throw new LifecycleUnavailableError("SCOPE_EXCHANGE_REQUIRED");
  if (!session.accessToken || session.isExpired(REFRESH_WINDOW_MS)) {
    throw new LifecycleUnavailableError("REAUTHENTICATION_REQUIRED");
  }
  return { status: await authority.probe(session), session };
}

export function createLifecycleSessionStorage(database: PrismaClient, authority: LifecycleAuthority = shopifyLifecycleAuthority) {
  const storage = new PrismaSessionStorage(database);
  const originalLoad = storage.loadSession.bind(storage);
  storage.loadSession = async (id: string) => {
    const initial = await originalLoad(id);
    if (!initial || initial.isOnline) return initial;
    const lock = await database.appOperationLock.findUnique({ where: { id: operationId(`shop:${initial.shop}`) } });
    return lock?.reauthRequired ? undefined : initial;
  };
  storage.storeSession = async (incoming: Session) => {
    const accepted = await withShopOperationLock(database, incoming.shop, async (tx) => {
      const base = transactionStorage(tx);
      // Await the official adapter's readiness check before any early return.
      const current = await base.loadSession(incoming.id);
      if (!incoming.isOnline && !incoming.accessToken) {
        if (current) {
          try {
            if ((await resolveSession(current, authority)).status === "active") return false;
          } catch {
            // Retain uncertain credentials; the next signed merchant request
            // can obtain a new grant without background destructive guessing.
          }
        }
        await tx.appOperationLock.update({ where: { id: operationId(`shop:${incoming.shop}`) }, data: { reauthRequired: true } });
        return false;
      }
      if (!incoming.isOnline && incoming.accessToken) {
        const result = await resolveSession(incoming, authority);
        if (result.status !== "active") return false;
        await base.storeSession(incoming);
        await markVerified(tx, incoming.shop, authority);
        return true;
      }
      await base.storeSession(incoming);
      return true;
    });
    // Throw after commit so the retry sentinel remains available to the SDK.
    if (!accepted) throw staleSessionError();
    return true;
  };
  storage.deleteSession = async (id: string) => {
    const record = await database.session.findUnique({ where: { id }, select: { shop: true } });
    if (!record) return true;
    const accepted = await withShopOperationLock(database, record.shop, async (tx) => {
      const base = transactionStorage(tx);
      const current = await base.loadSession(id);
      if (current && !current.isOnline) {
        try {
          if ((await resolveSession(current, authority)).status === "active") return false;
        } catch { /* Preserve uncertain credentials for verified merchant reauth. */ }
        await tx.appOperationLock.update({ where: { id: operationId(`shop:${record.shop}`) }, data: { reauthRequired: true } });
        return false;
      }
      await base.deleteSession(id);
      return true;
    });
    if (!accepted) throw staleSessionError();
    return true;
  };
  storage.deleteSessions = async (ids: string[]) => {
    for (const id of ids) await storage.deleteSession(id);
    return true;
  };
  return storage;
}

export async function cleanupShopLifecycle(database: PrismaClient, shop: string, authority: LifecycleAuthority = shopifyLifecycleAuthority) {
  try {
    const outcome = await withShopOperationLock(database, shop, async (tx) => {
      const base = transactionStorage(tx);
      const current = await base.loadSession(`offline_${shop}`);
      if (current) {
        const result = await resolveSession(current, authority);
        if (result.status === "active") {
          await recordCleanupStatus(tx, shop, "ACTIVE_INSTALLATION");
          return "active" as const;
        }
        const lock = await tx.appOperationLock.findUnique({ where: { id: operationId(`shop:${shop}`) } });
        if (lock?.credentialFingerprint !== authority.credentialFingerprint()) {
          throw new LifecycleUnavailableError("CREDENTIAL_EPOCH_UNVERIFIED");
        }
      }
      // Provider intent is committed before DELETE is ever dispatched. A retry
      // cannot lose the immutable old contact identity during a transaction rollback.
      const erasure = await eraseMarketingSubscriptionInTransaction(tx, shop);
      if (erasure.status === "retry") {
        await recordCleanupStatus(tx, shop, "PROVIDER_ERASURE_PENDING");
        return "retry" as const;
      }
      await tx.sitemapShop.deleteMany({ where: { shop } });
      await tx.session.deleteMany({ where: { shop } });
      await recordCleanupStatus(tx, shop, "ERASED");
      return "erased" as const;
    });
    if (outcome === "retry") throw new LifecycleUnavailableError("PROVIDER_ERASURE_PENDING");
    return outcome;
  } catch (error) {
    await withShopOperationLock(database, shop, (tx) => recordCleanupStatus(tx, shop,
      error instanceof LifecycleUnavailableError ? error.reason : "CLEANUP_RETRY_REQUIRED"));
    throw error;
  }
}
