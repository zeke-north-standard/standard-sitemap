import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/models/sitemap.store.server", () => ({
  saveSitemapSnapshot: vi.fn(),
}));
vi.mock("~/models/shopify-graphql.server", () => ({
  graphqlRequest: vi.fn(),
  publicPathFromOnlineStoreUrl: vi.fn(
    (url: string | null, fallback: string) => url ?? fallback,
  ),
}));

import { graphqlRequest } from "~/models/shopify-graphql.server";
import { syncSitemapForShop } from "~/models/sitemap.sync.server";
import { saveSitemapSnapshot } from "~/models/sitemap.store.server";
import { DEFAULT_SITEMAP_CONFIG } from "~/models/sitemap.config";

beforeEach(() => vi.resetAllMocks());

function emptyResponse(query: string) {
  if (query.includes("query SitemapNavigation")) return { menus: { nodes: [] } };
  if (query.includes("query SitemapPolicies")) return { shop: { shopPolicies: [] } };
  if (query.includes("query CurrentAppInstallation")) {
    return { currentAppInstallation: { id: "gid://shopify/AppInstallation/1" } };
  }
  if (query.includes("mutation SetSitemapMetafields")) {
    return { metafieldsSet: { userErrors: [] } };
  }
  const field = query.includes("query SitemapProducts") ? "products"
    : query.includes("query SitemapCollections") ? "collections"
    : query.includes("query SitemapPages") ? "pages" : "articles";
  return { [field]: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } };
}

function product(index: number) {
  return {
    title: `Product ${index}`,
    handle: `product-${index}`,
    onlineStoreUrl: null,
    updatedAt: "2026-09-30T00:00:00Z",
  };
}

describe("sitemap sync", () => {
  it("reports truncation when a single section exceeds the link limit", async () => {
    vi.mocked(graphqlRequest).mockImplementation(
      async (_admin, query, variables) => {
        if (query.includes("query SitemapProducts")) {
          const page = variables?.after
            ? Number(String(variables.after).slice(1))
            : 0;
          return {
            products: {
              nodes: Array.from({ length: 250 }, (_, index) => ({
                title: `Product ${page * 250 + index}`,
                handle: `product-${page * 250 + index}`,
                onlineStoreUrl: null,
                updatedAt: "2026-09-30T00:00:00Z",
              })),
              pageInfo: {
                hasNextPage: page < 20,
                endCursor: `p${page + 1}`,
              },
            },
          } as never;
        }
        if (query.includes("query SitemapNavigation")) {
          return { menus: { nodes: [] } } as never;
        }
        if (query.includes("query SitemapPolicies")) {
          return { shop: { shopPolicies: [] } } as never;
        }
        if (query.includes("query CurrentAppInstallation")) {
          return {
            currentAppInstallation: { id: "gid://shopify/AppInstallation/1" },
          } as never;
        }
        if (query.includes("mutation SetSitemapMetafields")) {
          return { metafieldsSet: { userErrors: [] } } as never;
        }
        const field = query.includes("query SitemapCollections")
          ? "collections"
          : query.includes("query SitemapPages")
            ? "pages"
            : "articles";
        return {
          [field]: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        } as never;
      },
    );

    const snapshot = await syncSitemapForShop({
      admin: {} as never,
      shop: "example.myshopify.com",
    });

    expect(snapshot.manifest.totalLinks).toBe(5000);
    expect(snapshot.manifest.truncated).toBe(true);
    expect(snapshot.manifest.truncatedSections).toContain("products");
  });
});

describe("new-store generation coverage", () => {
  it("generates an empty store and saves only to the requested tenant after publishing", async () => {
    vi.mocked(graphqlRequest).mockImplementation(async (_admin, query) => emptyResponse(query) as never);
    const snapshot = await syncSitemapForShop({ admin: {} as never, shop: "new-shop.myshopify.com" });
    expect(snapshot.manifest).toMatchObject({ totalLinks: 0, truncated: false, warnings: [] });
    expect(snapshot.sections.every((section) => section.links.length === 0)).toBe(true);
    expect(saveSitemapSnapshot).toHaveBeenCalledExactlyOnceWith("new-shop.myshopify.com", snapshot, []);
    const publication = vi.mocked(graphqlRequest).mock.calls.findIndex(([, query]) => query.includes("mutation SetSitemapMetafields"));
    expect(vi.mocked(graphqlRequest).mock.invocationCallOrder[publication]).toBeLessThan(vi.mocked(saveSitemapSnapshot).mock.invocationCallOrder[0]);
  });

  it("collects all resource types and third-level menu items without assuming terminal children", async () => {
    vi.mocked(graphqlRequest).mockImplementation(async (_admin, query) => {
      if (query.includes("query SitemapNavigation")) return { menus: { nodes: [{ handle: "main-menu", isDefault: true, items: [{ title: "Parent", url: null, items: [{ title: "Child", url: "/collections/all", items: [{ title: "Grandchild", url: "/pages/contact" }] }] }] }] } } as never;
      if (query.includes("query SitemapPolicies")) return { shop: { shopPolicies: [{ title: "Refunds", url: "/policies/refund-policy", updatedAt: null }] } } as never;
      const connection = { pageInfo: { hasNextPage: false, endCursor: null } };
      if (query.includes("query SitemapProducts")) return { products: { ...connection, nodes: [product(1)] } } as never;
      if (query.includes("query SitemapCollections")) return { collections: { ...connection, nodes: [{ title: "Summer", handle: "summer", updatedAt: null }] } } as never;
      if (query.includes("query SitemapPages")) return { pages: { ...connection, nodes: [{ title: "Contact", handle: "contact", updatedAt: null }] } } as never;
      if (query.includes("query SitemapArticles")) return { articles: { ...connection, nodes: [{ title: "Story", handle: "story", blog: { handle: "news" }, updatedAt: null }] } } as never;
      return emptyResponse(query) as never;
    });
    const snapshot = await syncSitemapForShop({ admin: {} as never, shop: "small.myshopify.com" });
    expect(snapshot.manifest.totalLinks).toBe(7);
    expect(snapshot.sections.find((section) => section.key === "navigation")?.links.map((link) => link.title)).toEqual(["Child", "Grandchild"]);
    expect(snapshot.sections.find((section) => section.key === "articles")?.links[0].url).toBe("/blogs/news/story");
  });

  it("paginates to exactly 5,000 products without reporting false truncation", async () => {
    vi.mocked(graphqlRequest).mockImplementation(async (_admin, query, variables) => {
      if (!query.includes("query SitemapProducts")) return emptyResponse(query) as never;
      const page = variables?.after ? Number(variables.after) : 0;
      return { products: { nodes: Array.from({ length: 250 }, (_, index) => product(page * 250 + index)), pageInfo: { hasNextPage: page < 19, endCursor: String(page + 1) } } } as never;
    });
    const snapshot = await syncSitemapForShop({ admin: {} as never, shop: "large.myshopify.com" });
    expect(snapshot.manifest).toMatchObject({ totalLinks: 5000, truncated: false, truncatedSections: [] });
    const pages = vi.mocked(graphqlRequest).mock.calls.filter(([, query]) => query.includes("query SitemapProducts"));
    expect(pages).toHaveLength(20);
    expect(pages[19][2]).toEqual({ first: 250, after: "19" });
    const writes = vi.mocked(graphqlRequest).mock.calls.filter(([, query]) => query.includes("mutation SetSitemapMetafields"));
    expect(writes).toHaveLength(1);
    expect(writes[0][2]?.metafields).toHaveLength(19);
  });

  it("keeps a policy permission warning while completing the other sections", async () => {
    vi.mocked(graphqlRequest).mockImplementation(async (_admin, query) => {
      if (query.includes("query SitemapPolicies")) throw new Error("Access denied: read_legal_policies required");
      return emptyResponse(query) as never;
    });
    const snapshot = await syncSitemapForShop({ admin: {} as never, shop: "limited.myshopify.com" });
    expect(snapshot.manifest.warnings).toMatchObject([{ section: "policies" }]);
    expect(saveSitemapSnapshot).toHaveBeenCalledOnce();
  });

  it("does not query or warn about policies when that section is disabled", async () => {
    vi.mocked(graphqlRequest).mockImplementation(async (_admin, query) => {
      if (query.includes("query SitemapPolicies")) throw new Error("Access denied: read_legal_policies required");
      return emptyResponse(query) as never;
    });
    const config = {
      ...DEFAULT_SITEMAP_CONFIG,
      enabledSections: DEFAULT_SITEMAP_CONFIG.enabledSections.filter((section) => section !== "policies"),
    };
    const snapshot = await syncSitemapForShop({ admin: {} as never, shop: "limited.myshopify.com", config });
    expect(snapshot.manifest.warnings).toEqual([]);
    expect(snapshot.sections.some((section) => section.key === "policies")).toBe(false);
    expect(vi.mocked(graphqlRequest).mock.calls.some(([, query]) => query.includes("query SitemapPolicies"))).toBe(false);
    expect(saveSitemapSnapshot).toHaveBeenCalledOnce();
  });

  it.each(["Network request failed", "THROTTLED: rate limit exceeded", "GraphQL data unavailable"])("preserves the previous snapshot on a collection failure: %s", async (message) => {
    vi.mocked(graphqlRequest).mockImplementation(async (_admin, query) => {
      if (query.includes("query SitemapCollections")) throw new Error(message);
      return emptyResponse(query) as never;
    });
    await expect(syncSitemapForShop({ admin: {} as never, shop: "example.myshopify.com" })).rejects.toThrow(message);
    expect(saveSitemapSnapshot).not.toHaveBeenCalled();
    expect(vi.mocked(graphqlRequest).mock.calls.some(([, query]) => query.includes("mutation SetSitemapMetafields"))).toBe(false);
  });

  it("does not downgrade a policy transport failure to a permissions warning", async () => {
    vi.mocked(graphqlRequest).mockImplementation(async (_admin, query) => {
      if (query.includes("query SitemapPolicies")) throw new Error("Shopify returned HTTP 503");
      return emptyResponse(query) as never;
    });
    await expect(syncSitemapForShop({ admin: {} as never, shop: "example.myshopify.com" })).rejects.toThrow("503");
    expect(saveSitemapSnapshot).not.toHaveBeenCalled();
  });

  it("retains the previous DB snapshot when Shopify rejects its metafields", async () => {
    vi.mocked(graphqlRequest).mockImplementation(async (_admin, query) => {
      if (query.includes("mutation SetSitemapMetafields")) return { metafieldsSet: { userErrors: [{ message: "Metafield limit exceeded" }] } } as never;
      return emptyResponse(query) as never;
    });
    await expect(syncSitemapForShop({ admin: {} as never, shop: "example.myshopify.com" })).rejects.toThrow("Metafield limit exceeded");
    expect(saveSitemapSnapshot).not.toHaveBeenCalled();
  });

  it("publishes 5,000 multilingual links, config and manifest in one atomic update", async () => {
    vi.mocked(graphqlRequest).mockImplementation(async (_admin, query, variables) => {
      if (query.includes("query SitemapNavigation")) return { menus: { nodes: [{ handle: "main-menu", isDefault: true, items: [{ title: "Home", url: "/", items: [] }] }] } } as never;
      if (!query.includes("query SitemapProducts")) return emptyResponse(query) as never;
      const page = variables?.after ? Number(variables.after) : 0;
      return { products: { nodes: Array.from({ length: page === 19 ? 249 : 250 }, (_, index) => ({ ...product(page * 250 + index), title: `${page * 250 + index} ${'🌍"\\'.repeat(50)}` })), pageInfo: { hasNextPage: page < 19, endCursor: String(page + 1) } } } as never;
    });
    const snapshot = await syncSitemapForShop({ admin: {} as never, shop: "unicode.myshopify.com" });
    expect(snapshot.manifest.totalLinks).toBe(5000);
    expect(snapshot.manifest.truncated).toBe(false);
    const batches = vi.mocked(graphqlRequest).mock.calls.filter(([, query]) => query.includes("mutation SetSitemapMetafields")).map(([, , variables]) => variables?.metafields as Array<{ key: string; value: string; ownerId: string }>);
    expect(snapshot.manifest.chunks.products).toBe(22);
    expect(snapshot.manifest.chunks.navigation).toBe(1);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(25);
    expect(batches[0].every((field) => Buffer.byteLength(field.value, "utf8") <= 128000)).toBe(true);
    expect(batches.flat().every((field) => field.ownerId === "gid://shopify/AppInstallation/1")).toBe(true);
    expect(batches[0].slice(-2).map((field) => field.key)).toEqual(["config", "manifest"]);
    expect(JSON.parse(batches[0].at(-1)!.value)).toMatchObject({ totalLinks: 5000, chunks: snapshot.manifest.chunks });
  });

  it("rejects a sitemap needing over 23 chunks before any Shopify writes", async () => {
    vi.mocked(graphqlRequest).mockImplementation(async (_admin, query, variables) => {
      if (query.includes("query SitemapProducts")) {
        const page = variables?.after ? Number(variables.after) : 0;
        return { products: { nodes: Array.from({ length: 250 }, (_, index) => ({ ...product(page * 250 + index), title: `${page * 250 + index} ${'🌍"\\'.repeat(120)}` })), pageInfo: { hasNextPage: page < 19, endCursor: String(page + 1) } } } as never;
      }
      return emptyResponse(query) as never;
    });
    await expect(syncSitemapForShop({ admin: {} as never, shop: "unicode.myshopify.com" })).rejects.toThrow("Choose fewer sections");
    expect(saveSitemapSnapshot).not.toHaveBeenCalled();
    expect(vi.mocked(graphqlRequest).mock.calls.some(([, query]) => query.includes("mutation SetSitemapMetafields"))).toBe(false);
  });

  it("rejects an oversized individual JSON field before any Shopify writes", async () => {
    vi.mocked(graphqlRequest).mockImplementation(async (_admin, query) => {
      if (query.includes("query SitemapProducts")) return { products: { nodes: [{ ...product(1), title: "x".repeat(130000) }], pageInfo: { hasNextPage: false, endCursor: null } } } as never;
      return emptyResponse(query) as never;
    });
    await expect(syncSitemapForShop({ admin: {} as never, shop: "oversized.myshopify.com" })).rejects.toThrow("Your existing sitemap has not been changed");
    expect(saveSitemapSnapshot).not.toHaveBeenCalled();
    expect(vi.mocked(graphqlRequest).mock.calls.some(([, query]) => query.includes("mutation SetSitemapMetafields"))).toBe(false);
  });

  it("keeps the previous DB snapshot when the single publication request fails", async () => {
    vi.mocked(graphqlRequest).mockImplementation(async (_admin, query) => {
      if (query.includes("mutation SetSitemapMetafields")) throw new Error("Shopify returned HTTP 503");
      return emptyResponse(query) as never;
    });
    await expect(syncSitemapForShop({ admin: {} as never, shop: "example.myshopify.com" })).rejects.toThrow("503");
    expect(saveSitemapSnapshot).not.toHaveBeenCalled();
    expect(vi.mocked(graphqlRequest).mock.calls.filter(([, query]) => query.includes("mutation SetSitemapMetafields"))).toHaveLength(1);
  });

  it.each([null, "same"])("rejects a missing/repeated pagination cursor (%s) instead of looping or silently losing data", async (cursor) => {
    vi.mocked(graphqlRequest).mockImplementation(async (_admin, query) => {
      if (query.includes("query SitemapProducts")) return { products: { nodes: [], pageInfo: { hasNextPage: true, endCursor: cursor } } } as never;
      return emptyResponse(query) as never;
    });
    await expect(syncSitemapForShop({ admin: {} as never, shop: "example.myshopify.com" })).rejects.toThrow("pagination did not advance");
    expect(saveSitemapSnapshot).not.toHaveBeenCalled();
    expect(vi.mocked(graphqlRequest).mock.calls.filter(([, query]) => query.includes("query SitemapProducts")).length).toBeLessThanOrEqual(2);
  });

  it("keeps separate generated snapshots scoped to their respective stores", async () => {
    vi.mocked(graphqlRequest).mockImplementation(async (_admin, query) => emptyResponse(query) as never);
    const hiddenProducts = { ...DEFAULT_SITEMAP_CONFIG, enabledSections: ["pages" as const], sectionOrder: ["pages" as const] };
    await syncSitemapForShop({ admin: {} as never, shop: "first.myshopify.com" });
    await syncSitemapForShop({ admin: {} as never, shop: "second.myshopify.com", config: hiddenProducts });
    expect(vi.mocked(saveSitemapSnapshot).mock.calls.map(([shop, snapshot]) => ({ shop, sections: snapshot.sections.map((section) => section.key) }))).toEqual([
      { shop: "first.myshopify.com", sections: DEFAULT_SITEMAP_CONFIG.sectionOrder },
      { shop: "second.myshopify.com", sections: ["pages"] },
    ]);
  });
});
