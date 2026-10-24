import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cleanup: vi.fn() }));
vi.mock("~/db.server", () => ({ default: { fixtureDatabase: true } }));
vi.mock("~/services/shop-lifecycle.server", () => {
  class LifecycleUnavailableError extends Error {}
  return { cleanupShopLifecycle: mocks.cleanup, LifecycleUnavailableError };
});

import { LifecycleUnavailableError } from "~/services/shop-lifecycle.server";
import { action as uninstallAction } from "../app/routes/webhooks.app.uninstalled";
import { action as complianceAction } from "../app/routes/webhooks.compliance";

const secret = "test-webhook-secret";
const shop = "review-shop.myshopify.com";
function signedRequest(topic: string, options: { signature?: string; body?: string; headerShop?: string } = {}) {
  const body = options.body ?? JSON.stringify({ shop_domain: shop });
  return new Request("https://app.example.com/webhooks", {
    method: "POST", body,
    headers: {
      "X-Shopify-Hmac-Sha256": options.signature ?? createHmac("sha256", secret).update(body).digest("base64"),
      "X-Shopify-Topic": topic,
      "X-Shopify-Shop-Domain": options.headerShop ?? shop,
      "X-Shopify-API-Version": "2026-04",
      "X-Shopify-Webhook-Id": "webhook-1",
    },
  });
}

describe("signed cleanup routing", () => {
  beforeAll(() => {
    vi.stubEnv("SHOPIFY_API_KEY", "test-api-key");
    vi.stubEnv("SHOPIFY_API_SECRET", secret);
    vi.stubEnv("SHOPIFY_APP_URL", "https://app.example.com");
  });
  afterAll(() => vi.unstubAllEnvs());
  beforeEach(() => { vi.resetAllMocks(); mocks.cleanup.mockResolvedValue("erased"); });

  it.each(["app/uninstalled", "shop/redact"])("routes %s through guarded cleanup", async (topic) => {
    const handler = topic === "app/uninstalled" ? uninstallAction : complianceAction;
    expect((await handler({ request: signedRequest(topic) } as never)).status).toBe(200);
    expect(mocks.cleanup).toHaveBeenCalledExactlyOnceWith({ fixtureDatabase: true }, shop);
  });
  it.each(["customers/data_request", "customers/redact"])("acknowledges %s without store deletion", async (topic) => {
    expect((await complianceAction({ request: signedRequest(topic) } as never)).status).toBe(200);
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
  it("rejects non-POST before cleanup", async () => {
    await expect(uninstallAction({ request: new Request("https://app.example.com/webhooks") } as never)).rejects.toMatchObject({ status: 405 });
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
  it("rejects an invalid signature", async () => {
    await expect(uninstallAction({ request: signedRequest("app/uninstalled", { signature: "invalid" }) } as never)).rejects.toMatchObject({ status: 401 });
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
  it("rejects an unexpected topic", async () => {
    await expect(uninstallAction({ request: signedRequest("shop/redact") } as never)).rejects.toMatchObject({ status: 400 });
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
  it("binds the tenant header to the signed body", async () => {
    await expect(uninstallAction({ request: signedRequest("app/uninstalled", { headerShop: "other.myshopify.com" }) } as never)).rejects.toMatchObject({ status: 400 });
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
  it.each(["{", "null", "[]", "{}"])("rejects malformed signed payload %s", async (body) => {
    await expect(uninstallAction({ request: signedRequest("app/uninstalled", { body }) } as never)).rejects.toMatchObject({ status: 400 });
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
  it.each(["app/uninstalled", "shop/redact"])("requests retry for uncertain %s cleanup", async (topic) => {
    mocks.cleanup.mockRejectedValueOnce(new LifecycleUnavailableError());
    const handler = topic === "app/uninstalled" ? uninstallAction : complianceAction;
    const pending = await handler({ request: signedRequest(topic) } as never);
    expect(pending.status).toBe(503);
    expect(pending.headers.get("Retry-After")).toBe("30");
    expect((await handler({ request: signedRequest(topic) } as never)).status).toBe(200);
  });
});
