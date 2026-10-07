import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SITEMAP_CONFIG } from "../app/models/sitemap.config";
import {
  getSitemapState,
  loadSnapshotForShop,
} from "../app/models/sitemap.store.server";

const { upsert, findMany } = vi.hoisted(() => ({
  upsert: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("../app/db.server", () => ({
  default: {
    sitemapShop: { upsert },
    sitemapChunk: { findMany },
  },
}));

describe("sitemap snapshot loading", () => {
  beforeEach(() => {
    upsert.mockReset();
    findMany.mockReset();
    findMany.mockResolvedValue([]);
  });

  it("reuses initialized state instead of creating the shop again", async () => {
    const shop = "new-shop.myshopify.com";
    const state = {
      config: DEFAULT_SITEMAP_CONFIG,
      manifest: null,
    } as Awaited<ReturnType<typeof getSitemapState>>;

    const snapshot = await loadSnapshotForShop(shop, state);

    expect(upsert).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledWith({
      where: { shop },
      orderBy: [{ section: "asc" }, { chunkIndex: "asc" }],
    });
    expect(snapshot.manifest.totalLinks).toBe(0);
    expect(snapshot.sections).toHaveLength(6);
  });
});
