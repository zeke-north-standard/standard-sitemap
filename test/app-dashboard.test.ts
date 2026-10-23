import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SITEMAP_CONFIG } from "~/models/sitemap.config";
import { SITEMAP_SECTIONS, type SitemapSnapshot } from "~/models/sitemap.types";

const mocks = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
  getState: vi.fn(),
  loadSnapshot: vi.fn(),
  markFailed: vi.fn(),
  saveConfig: vi.fn(),
  sync: vi.fn(),
  getMarketing: vi.fn(),
  subscribe: vi.fn(),
  syncMarketing: vi.fn(),
  unsubscribe: vi.fn(),
  syncUnsubscribe: vi.fn(),
  listMenus: vi.fn(),
  addMenuLink: vi.fn(),
  setupPage: vi.fn(),
  verifyPublication: vi.fn(),
}));

vi.mock("~/shopify.server", () => ({
  authenticate: { admin: mocks.authenticateAdmin },
}));
vi.mock("~/models/sitemap.store.server", () => ({
  getSitemapState: mocks.getState,
  loadSnapshotForShop: mocks.loadSnapshot,
  markSitemapSyncFailed: mocks.markFailed,
  saveSitemapConfig: mocks.saveConfig,
}));
vi.mock("~/models/sitemap.sync.server", () => ({
  syncSitemapForShop: mocks.sync,
}));
vi.mock("~/models/marketing-consent.server", () => ({
  getMarketingSubscription: mocks.getMarketing,
  subscribeToMarketing: mocks.subscribe,
  syncMarketingSubscription: mocks.syncMarketing,
  unsubscribeFromMarketing: mocks.unsubscribe,
  syncMarketingUnsubscribe: mocks.syncUnsubscribe,
}));
vi.mock("~/models/sitemap.navigation.server", () => ({
  listSitemapMenus: mocks.listMenus,
  addSitemapLinkToMenu: mocks.addMenuLink,
}));
vi.mock("~/models/sitemap.page.server", () => ({
  findOrCreateSitemapPage: mocks.setupPage,
}));
vi.mock("~/models/sitemap.publication.server", () => ({
  verifySitemapPublication: mocks.verifyPublication,
}));

import { action, loader } from "../app/routes/app._index";

const shop = "new-install.myshopify.com";
const admin = { graphql: vi.fn() };

function initialState() {
  return {
    shop,
    config: structuredClone(DEFAULT_SITEMAP_CONFIG),
    manifest: null,
    lastSyncStatus: "NEVER_SYNCED",
    lastSyncError: null,
    lastSyncedAt: null,
    totalLinks: 0,
    truncated: false,
    sitemapPageHandle: null,
  };
}

function emptySnapshot(): SitemapSnapshot {
  return {
    config: structuredClone(DEFAULT_SITEMAP_CONFIG),
    manifest: {
      version: 1,
      generatedAt: new Date(0).toISOString(),
      locale: "primary",
      totalLinks: 0,
      maxLinks: 5000,
      chunks: {},
      truncated: false,
      truncatedSections: [],
      warnings: [],
    },
    sections: SITEMAP_SECTIONS.map((key) => ({ key, title: key, links: [] })),
  };
}

function getRequest() {
  return new Request("https://app.example.com/app?shop=forged.myshopify.com");
}

function postRequest(intent: string, fields: Record<string, string> = {}) {
  return new Request("https://app.example.com/app", {
    method: "POST",
    body: new URLSearchParams({ intent, ...fields }),
  });
}

function authenticationRecoveryResponse(status: 401 | 302) {
  return status === 401
    ? new Response(null, {
        status,
        headers: { "X-Shopify-Retry-Invalid-Session-Request": "1" },
      })
    : Response.redirect("https://app.example.com/auth/session-token");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authenticateAdmin.mockResolvedValue({ admin, session: { shop } });
  mocks.getState.mockResolvedValue(initialState());
  mocks.loadSnapshot.mockResolvedValue(emptySnapshot());
  mocks.getMarketing.mockResolvedValue(null);
  mocks.listMenus.mockResolvedValue([]);
  mocks.sync.mockResolvedValue(emptySnapshot());
  mocks.markFailed.mockResolvedValue(undefined);
});

describe("new-install dashboard loading", () => {
  it("loads the initial empty state using the authenticated shop", async () => {
    const request = getRequest();
    const result = await loader({ request } as never);

    expect(mocks.authenticateAdmin).toHaveBeenCalledExactlyOnceWith(request);
    expect(mocks.getState).toHaveBeenCalledExactlyOnceWith(shop);
    expect(mocks.loadSnapshot).toHaveBeenCalledExactlyOnceWith(shop, initialState());
    expect(mocks.getMarketing).toHaveBeenCalledExactlyOnceWith(shop);
    expect(mocks.listMenus).toHaveBeenCalledExactlyOnceWith(admin);
    expect(result.data).toMatchObject({
      proxyUrl: `https://${shop}/apps/html-sitemap`,
      menuEditorUrl: `https://${shop}/admin/menus`,
      footerMenus: [],
      marketing: null,
      menusUnavailable: false,
      marketingUnavailable: false,
      state: {
        lastSyncStatus: "NEVER_SYNCED",
        manifest: null,
        lastSyncedAt: null,
        totalLinks: 0,
      },
    });
    expect(Object.values(result.data.sectionCounts)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(result.data.previewHtml).toContain("<!doctype html>");
  });

  it("preserves an authentication redirect before touching shop data", async () => {
    const redirect = Response.redirect("https://app.example.com/auth/login");
    mocks.authenticateAdmin.mockRejectedValueOnce(redirect);

    await expect(loader({ request: getRequest() } as never)).rejects.toBe(redirect);
    expect(mocks.getState).not.toHaveBeenCalled();
    expect(mocks.loadSnapshot).not.toHaveBeenCalled();
    expect(mocks.getMarketing).not.toHaveBeenCalled();
    expect(mocks.listMenus).not.toHaveBeenCalled();
  });

  it("loads the sitemap when the optional menu service is unavailable", async () => {
    mocks.listMenus.mockRejectedValueOnce(new Error("Shopify menus unavailable"));

    const result = await loader({ request: getRequest() } as never);

    expect(result.data).toMatchObject({ footerMenus: [], menusUnavailable: true });
    expect(result.data.state.lastSyncStatus).toBe("NEVER_SYNCED");
  });

  it.each([
    ["listMenus", 401],
    ["listMenus", 302],
    ["getMarketing", 401],
    ["getMarketing", 302],
  ] as const)("preserves query-time HTTP %s / %s recovery instead of hiding it as an optional failure", async (dependency, status) => {
    const response = authenticationRecoveryResponse(status);
    mocks[dependency].mockRejectedValueOnce(response);

    await expect(loader({ request: getRequest() } as never)).rejects.toBe(response);
  });

  it("loads the sitemap when optional marketing storage is unavailable", async () => {
    const menu = { id: "gid://shopify/Menu/1", title: "Footer", handle: "footer" };
    mocks.listMenus.mockResolvedValueOnce([menu]);
    mocks.getMarketing.mockRejectedValueOnce(new Error("Marketing table unavailable"));

    const result = await loader({ request: getRequest() } as never);

    expect(result.data).toMatchObject({
      marketing: null,
      marketingUnavailable: true,
      footerMenus: [menu],
      menusUnavailable: false,
    });
  });

  it("keeps the core dashboard available if both optional services fail", async () => {
    mocks.listMenus.mockRejectedValueOnce(new Error("Menus failed"));
    mocks.getMarketing.mockRejectedValueOnce(new Error("Marketing failed"));

    const result = await loader({ request: getRequest() } as never);

    expect(result.data).toMatchObject({
      footerMenus: [],
      marketing: null,
      menusUnavailable: true,
      marketingUnavailable: true,
      state: { totalLinks: 0 },
    });
  });

  it("does not conceal a failure to load the shop's core state", async () => {
    const error = new Error("Sitemap database unavailable");
    mocks.getState.mockRejectedValueOnce(error);

    await expect(loader({ request: getRequest() } as never)).rejects.toBe(error);
    expect(mocks.loadSnapshot).not.toHaveBeenCalled();
  });

  it("does not replace a broken persisted snapshot with an apparent empty success", async () => {
    const error = new Error("Snapshot cannot be loaded");
    mocks.loadSnapshot.mockRejectedValueOnce(error);

    await expect(loader({ request: getRequest() } as never)).rejects.toBe(error);
  });
});

describe("dashboard actions", () => {
  it("preserves authentication recovery before any action runs", async () => {
    const redirect = Response.redirect("https://app.example.com/auth/login");
    mocks.authenticateAdmin.mockRejectedValueOnce(redirect);

    await expect(action({ request: postRequest("sync") } as never)).rejects.toBe(redirect);
    expect(mocks.getState).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });

  it.each([
    ["sync", "sync", 401],
    ["sync", "sync", 302],
    ["save-config", "sync", 401],
    ["save-config", "sync", 302],
    ["setup-page", "setupPage", 401],
    ["setup-page", "setupPage", 302],
    ["add-footer-link", "addMenuLink", 401],
    ["add-footer-link", "addMenuLink", 302],
  ] as const)("preserves %s query-time %s / HTTP %s recovery without saving a sync failure", async (intent, dependency, status) => {
    const response = authenticationRecoveryResponse(status);
    mocks[dependency].mockRejectedValueOnce(response);

    await expect(action({
      request: postRequest(intent, { menuId: "gid://shopify/Menu/1" }),
    } as never)).rejects.toBe(response);
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });

  it("generates for the authenticated shop even when a different shop is submitted", async () => {
    const result = await action({
      request: postRequest("sync", { shop: "other-tenant.myshopify.com" }),
    } as never);

    expect(mocks.getState).toHaveBeenCalledExactlyOnceWith(shop);
    expect(mocks.sync).toHaveBeenCalledExactlyOnceWith({
      admin, shop, config: DEFAULT_SITEMAP_CONFIG,
    });
    expect(result.data).toHaveProperty("message");
  });

  it("passes validated settings to the sync without saving a partial new configuration", async () => {
    const result = await action({
      request: postRequest("save-config", {
        shop: "other-tenant.myshopify.com",
        layout: "compact",
        columns: "99",
        accentColor: "invalid-color",
        "enabled:pages": "on",
      }),
    } as never);

    expect(mocks.sync).toHaveBeenCalledExactlyOnceWith({
      admin,
      shop,
      config: expect.objectContaining({
        layout: "compact",
        columns: 4,
        accentColor: DEFAULT_SITEMAP_CONFIG.accentColor,
        enabledSections: ["pages"],
      }),
    });
    expect(mocks.saveConfig).not.toHaveBeenCalled();
    expect(result.data).toHaveProperty("message");
  });

  it.each(["sync", "save-config"])("reports a failed %s without claiming success", async (intent) => {
    const error = new Error("Shopify could not finish generating the sitemap");
    mocks.sync.mockRejectedValueOnce(error);

    const result = await action({ request: postRequest(intent) } as never);

    expect(mocks.markFailed).toHaveBeenCalledExactlyOnceWith(shop, error);
    expect(result.data).toEqual({ error: error.message });
    expect(result.init?.status).toBe(500);
    expect(mocks.saveConfig).not.toHaveBeenCalled();
  });

  it("returns the original sync error even if recording the error also fails", async () => {
    const error = new Error("Shopify connection failed");
    mocks.sync.mockRejectedValueOnce(error);
    mocks.markFailed.mockRejectedValueOnce(new Error("Database is offline"));

    const result = await action({ request: postRequest("sync") } as never);

    expect(result.data).toEqual({ error: error.message });
    expect(result.init?.status).toBe(500);
  });

  it("does not mark sitemap generation failed for an unrelated menu action error", async () => {
    mocks.addMenuLink.mockRejectedValueOnce(new Error("Menu permission denied"));

    const result = await action({
      request: postRequest("add-footer-link", { menuId: "gid://shopify/Menu/1" }),
    } as never);

    expect(result.data).toEqual({ error: "Menu permission denied" });
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });

  it("rejects email subscription without explicit consent and never contacts the provider", async () => {
    const result = await action({
      request: postRequest("subscribe-marketing", { email: "owner@example.com" }),
    } as never);

    expect(result.init?.status).toBe(400);
    expect(mocks.subscribe).not.toHaveBeenCalled();
    expect(mocks.syncMarketing).not.toHaveBeenCalled();
  });

  it("saves consent for the authenticated shop and reports provider failure as a retryable warning", async () => {
    mocks.syncMarketing.mockRejectedValueOnce(new Error("Email provider unavailable"));

    const result = await action({
      request: postRequest("subscribe-marketing", {
        shop: "forged.myshopify.com",
        email: "owner@example.com",
        marketingConsent: "on",
      }),
    } as never);

    expect(mocks.subscribe).toHaveBeenCalledExactlyOnceWith(shop, "owner@example.com");
    expect(mocks.syncMarketing).toHaveBeenCalledExactlyOnceWith(shop);
    expect(result.data).toHaveProperty("warning");
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });

  it("does not call an email provider when saving consent fails", async () => {
    mocks.subscribe.mockRejectedValueOnce(new Error("Invalid email"));

    const result = await action({
      request: postRequest("subscribe-marketing", {
        email: "invalid-email", marketingConsent: "on",
      }),
    } as never);

    expect(result.data).toEqual({ error: "Invalid email" });
    expect(mocks.syncMarketing).not.toHaveBeenCalled();
  });

  it("retains unsubscribe success locally when the email provider is unavailable", async () => {
    mocks.syncUnsubscribe.mockRejectedValueOnce(new Error("Email provider unavailable"));

    const result = await action({
      request: postRequest("unsubscribe-marketing", { shop: "forged.myshopify.com" }),
    } as never);

    expect(mocks.unsubscribe).toHaveBeenCalledExactlyOnceWith(shop);
    expect(mocks.syncUnsubscribe).toHaveBeenCalledExactlyOnceWith(shop);
    expect(result.data).toHaveProperty("warning");
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });

  it("checks publication only at the authenticated shop's proxy", async () => {
    mocks.verifyPublication.mockResolvedValueOnce({ tone: "success", message: "Ready" });

    const result = await action({
      request: postRequest("verify-publication", { shop: "forged.myshopify.com" }),
    } as never);

    expect(mocks.verifyPublication).toHaveBeenCalledExactlyOnceWith(
      `https://${shop}/apps/html-sitemap`,
    );
    expect(result.data).toHaveProperty("verification");
  });

  it("returns a controlled error for an unknown action without writing data", async () => {
    const result = await action({ request: postRequest("not-an-action") } as never);

    expect(result.init?.status).toBe(400);
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.saveConfig).not.toHaveBeenCalled();
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });
});
