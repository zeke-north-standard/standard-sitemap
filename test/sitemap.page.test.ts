import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphqlClient } from "~/models/shopify-graphql.server";

const savePage = vi.hoisted(() => vi.fn());
vi.mock("~/models/sitemap.store.server", () => ({ saveSitemapPage: savePage }));
import { findOrCreateSitemapPage } from "~/models/sitemap.page.server";

function client(responses: unknown[]) {
  return { graphql: vi.fn(async () => new Response(JSON.stringify({ data: responses.shift() }))) } as unknown as GraphqlClient & { graphql: ReturnType<typeof vi.fn> };
}
const shop = "new-install.myshopify.com";
const page = { id: "gid://shopify/Page/1", handle: "sitemap", title: "Sitemap" };

describe("optional Sitemap page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reuses an existing merchant page without changing its content", async () => {
    const admin = client([{ pages: { nodes: [page] } }]);
    expect(await findOrCreateSitemapPage(admin, shop)).toEqual(page);
    expect(admin.graphql).toHaveBeenCalledOnce();
    expect(savePage).toHaveBeenCalledWith(shop, { id: page.id, handle: page.handle });
  });

  it("creates one page on a new install and remembers Shopify's returned handle", async () => {
    const created = { ...page, handle: "sitemap-1" };
    const admin = client([{ pages: { nodes: [] } }, { pageCreate: { page: created, userErrors: [] } }]);
    expect(await findOrCreateSitemapPage(admin, shop)).toEqual(created);
    expect(admin.graphql).toHaveBeenCalledTimes(2);
    expect(savePage).toHaveBeenCalledWith(shop, { id: page.id, handle: "sitemap-1" });
  });

  it("does not save a failed optional page creation", async () => {
    const admin = client([{ pages: { nodes: [] } }, { pageCreate: { page: null, userErrors: [{ message: "Page creation denied" }] } }]);
    await expect(findOrCreateSitemapPage(admin, shop)).rejects.toThrow("Page creation denied");
    expect(savePage).not.toHaveBeenCalled();
  });

  it("does not claim a page was created when Shopify returns no page", async () => {
    const admin = client([{ pages: { nodes: [] } }, { pageCreate: { page: null, userErrors: [] } }]);
    await expect(findOrCreateSitemapPage(admin, shop)).rejects.toThrow("Shopify did not create");
    expect(savePage).not.toHaveBeenCalled();
  });
});
