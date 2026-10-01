import { describe, expect, it, vi } from "vitest";

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
