import { createHmac } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  deleteSessions: vi.fn(),
  deleteSitemap: vi.fn(),
  deleteMarketing: vi.fn(),
}));

vi.mock("~/db.server", () => ({
  default: {
    session: { deleteMany: mocks.deleteSessions },
    sitemapShop: { deleteMany: mocks.deleteSitemap },
  },
}));
vi.mock("~/models/marketing-consent.server", () => ({
  deleteMarketingSubscription: mocks.deleteMarketing,
}));

import { action as uninstallAction } from "../app/routes/webhooks.app.uninstalled";
import { action as complianceAction } from "../app/routes/webhooks.compliance";

const secret = "test-webhook-secret";
const shop = "review-shop.myshopify.com";

function signedRequest(topic: string, signature?: string) {
  const body = JSON.stringify({ shop_domain: shop });
  return new Request("https://app.example.com/webhooks", {
    method: "POST",
    body,
    headers: {
      "X-Shopify-Hmac-Sha256":
        signature ?? createHmac("sha256", secret).update(body).digest("base64"),
      "X-Shopify-Topic": topic,
      "X-Shopify-Shop-Domain": shop,
      "X-Shopify-API-Version": "2026-04",
      "X-Shopify-Webhook-Id": "webhook-1",
    },
  });
}

describe("cleanup webhooks", () => {
  beforeAll(() => {
    vi.stubEnv("SHOPIFY_API_KEY", "test-api-key");
    vi.stubEnv("SHOPIFY_API_SECRET", secret);
    vi.stubEnv("SHOPIFY_APP_URL", "https://app.example.com");
  });

  afterAll(() => vi.unstubAllEnvs());

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("cleans up an uninstalled shop without refreshing its revoked token", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const response = await uninstallAction({
      request: signedRequest("app/uninstalled"),
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.deleteSessions).toHaveBeenCalledWith({ where: { shop } });
    expect(mocks.deleteSitemap).toHaveBeenCalledWith({ where: { shop } });
    expect(mocks.deleteMarketing).toHaveBeenCalledWith(shop);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cleans up a shop/redact delivery without an access token", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const response = await complianceAction({
      request: signedRequest("shop/redact"),
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.deleteSessions).toHaveBeenCalledWith({ where: { shop } });
    expect(mocks.deleteSitemap).toHaveBeenCalledWith({ where: { shop } });
    expect(mocks.deleteMarketing).toHaveBeenCalledWith(shop);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("acknowledges customer data requests without deleting shop data", async () => {
    const response = await complianceAction({
      request: signedRequest("customers/data_request"),
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.deleteSessions).not.toHaveBeenCalled();
    expect(mocks.deleteSitemap).not.toHaveBeenCalled();
    expect(mocks.deleteMarketing).not.toHaveBeenCalled();
  });

  it("acknowledges customer redaction without deleting unrelated shop data", async () => {
    expect((await complianceAction({ request: signedRequest("customers/redact") } as never)).status).toBe(200);
    expect(mocks.deleteSessions).not.toHaveBeenCalled();
    expect(mocks.deleteSitemap).not.toHaveBeenCalled();
    expect(mocks.deleteMarketing).not.toHaveBeenCalled();
  });

  it("rejects non-POST cleanup before touching stored data", async () => {
    await expect(uninstallAction({ request: new Request("https://app.example.com/webhooks/app/uninstalled") } as never))
      .rejects.toMatchObject({ status: 405 });
    expect(mocks.deleteSessions).not.toHaveBeenCalled();
  });

  it("rejects a bad signature before deleting anything", async () => {
    await expect(
      uninstallAction({
        request: signedRequest("app/uninstalled", "invalid"),
      } as never),
    ).rejects.toMatchObject({ status: 401 });

    expect(mocks.deleteSessions).not.toHaveBeenCalled();
    expect(mocks.deleteSitemap).not.toHaveBeenCalled();
    expect(mocks.deleteMarketing).not.toHaveBeenCalled();
  });

  it("rejects an unexpected topic on the uninstall route", async () => {
    await expect(
      uninstallAction({
        request: signedRequest("shop/redact"),
      } as never),
    ).rejects.toMatchObject({ status: 400 });

    expect(mocks.deleteSessions).not.toHaveBeenCalled();
  });

  it("lets Shopify retry a provider erasure failure after the access token is removed", async () => {
    mocks.deleteMarketing.mockRejectedValueOnce(new Error("Provider unavailable"));
    await expect(uninstallAction({ request: signedRequest("app/uninstalled") } as never))
      .rejects.toThrow("Provider unavailable");

    expect((await uninstallAction({ request: signedRequest("app/uninstalled") } as never)).status).toBe(200);
    expect(mocks.deleteMarketing).toHaveBeenCalledTimes(2);
  });
});
