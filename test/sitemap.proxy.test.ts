import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  loadSnapshot: vi.fn(),
  render: vi.fn(() => '<div class="html-sitemap"></div>'),
}));

vi.mock("~/shopify.server", () => ({ authenticate: { public: { appProxy: mocks.authenticate } } }));
vi.mock("~/models/sitemap.store.server", () => ({ loadSnapshotForShop: mocks.loadSnapshot }));
vi.mock("~/models/sitemap.render", () => ({ renderSitemapLiquid: mocks.render }));

import { loader } from "../app/routes/proxy.html-sitemap";

describe("public sitemap proxy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("authenticates before reading any tenant data", async () => {
    mocks.authenticate.mockRejectedValueOnce(new Response(null, { status: 401 }));
    await expect(loader({ request: new Request("https://app.example.com/proxy/html-sitemap?shop=other.myshopify.com") } as never))
      .rejects.toMatchObject({ status: 401 });
    expect(mocks.loadSnapshot).not.toHaveBeenCalled();
  });

  it("uses the installed session shop rather than a query-string tenant", async () => {
    mocks.authenticate.mockResolvedValueOnce({ session: { shop: "installed.myshopify.com" } });
    mocks.loadSnapshot.mockResolvedValueOnce({ snapshot: true });
    const response = await loader({ request: new Request("https://app.example.com/proxy/html-sitemap?shop=other.myshopify.com") } as never);

    expect(mocks.loadSnapshot).toHaveBeenCalledWith("installed.myshopify.com");
    expect(mocks.render).toHaveBeenCalledWith({ snapshot: true });
    expect(response.headers.get("content-type")).toBe("application/liquid; charset=utf-8");
    expect(response.status).toBe(200);
  });

  it("does not recreate deleted tenant data for a signed request without an installed session", async () => {
    mocks.authenticate.mockResolvedValueOnce({ session: undefined });
    const response = await loader({ request: new Request("https://app.example.com/proxy/html-sitemap?shop=uninstalled.myshopify.com") } as never);

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.loadSnapshot).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });
});
