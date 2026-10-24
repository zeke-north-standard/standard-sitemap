import "@shopify/shopify-api/adapters/web-api";
import { ApiVersion, LogSeverity, shopifyApi, WebhookValidationErrorReason } from "@shopify/shopify-api";
import { createHash } from "node:crypto";

let api: ReturnType<typeof shopifyApi> | undefined;

export function lifecycleCredentialFingerprint() {
  const key = process.env.SHOPIFY_API_KEY;
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!key || !secret) throw new Error("Shopify lifecycle verification is unavailable.");
  return createHash("sha256").update(`${key}\u0000${secret}`).digest("hex");
}

export function getLifecycleApi() {
  if (api) return api;
  const secret = process.env.SHOPIFY_API_SECRET;
  const key = process.env.SHOPIFY_API_KEY;
  const url = process.env.SHOPIFY_APP_URL;
  if (!secret || !key || !url) throw new Error("Shopify lifecycle verification is unavailable.");
  const appUrl = new URL(url);
  api = shopifyApi({
    apiKey: key, apiSecretKey: secret, apiVersion: ApiVersion.April26,
    hostName: appUrl.host, hostScheme: appUrl.protocol === "http:" ? "http" : "https",
    isEmbeddedApp: true,
    logger: { level: LogSeverity.Error, httpRequests: false, log: () => {} },
  });
  return api;
}

// Verification deliberately needs no offline token: uninstall revokes it.
export async function authenticateCleanupWebhook(request: Request, allowedTopics: readonly string[]) {
  if (request.method !== "POST") throw new Response(null, { status: 405 });
  const rawBody = await request.text();
  const result = await getLifecycleApi().webhooks.validate({ rawBody, rawRequest: request });
  if (!result.valid) {
    throw new Response(null, { status: result.reason === WebhookValidationErrorReason.InvalidHmac ? 401 : 400 });
  }
  if (!allowedTopics.includes(result.topic)) throw new Response(null, { status: 400 });
  let payload: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(rawBody);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    payload = value as Record<string, unknown>;
  } catch { throw new Response(null, { status: 400 }); }
  const bodyShop = payload.myshopify_domain ?? payload.shop_domain;
  if (typeof bodyShop !== "string" || bodyShop !== result.domain) throw new Response(null, { status: 400 });
  return { shop: result.domain, topic: result.topic };
}
