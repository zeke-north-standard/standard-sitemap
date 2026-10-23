import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { DEFAULT_SITEMAP_CONFIG } from "../app/models/sitemap.config";
import {
  getSitemapState,
  ensureSitemapShop,
  loadSnapshotForShop,
} from "../app/models/sitemap.store.server";

const { upsert, findUnique, findMany } = vi.hoisted(() => ({
  upsert: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("../app/db.server", () => ({
  default: {
    sitemapShop: { upsert, findUnique },
    sitemapChunk: { findMany },
  },
}));

describe("sitemap snapshot loading", () => {
  beforeEach(() => {
    upsert.mockReset();
    findUnique.mockReset();
    findMany.mockReset();
    findMany.mockResolvedValue([]);
  });

  it("initializes a fresh shop with safe defaults and an empty snapshot", async () => {
    const shop = "fresh-shop.myshopify.com";
    upsert.mockResolvedValue(shopRecord(shop));

    const state = await getSitemapState(shop);
    const snapshot = await loadSnapshotForShop(shop, state);

    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert).toHaveBeenCalledWith({
      where: { shop },
      create: { shop, configJson: JSON.stringify(DEFAULT_SITEMAP_CONFIG) },
      update: {},
    });
    expect(state.config).toEqual(DEFAULT_SITEMAP_CONFIG);
    expect(state.manifest).toBeNull();
    expect(snapshot.manifest).toMatchObject({ totalLinks: 0, chunks: {} });
    expect(snapshot.sections.every((section) => section.links.length === 0)).toBe(true);
    expect(findMany).toHaveBeenCalledWith({
      where: { shop },
      orderBy: [{ section: "asc" }, { chunkIndex: "asc" }],
    });
  });

  it("lets both first-load requests use the winner of a concurrent shop insert", async () => {
    const shop = "parallel-new-shop.myshopify.com";
    const record = shopRecord(shop);
    let reads = 0;
    let inserted = false;
    let releaseReads!: () => void;
    const readsComplete = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });

    // Model Prisma's read-before-create empty-update upsert: both requests see
    // no row, then one wins the unique shop insert and the other gets P2002.
    upsert.mockImplementation(async () => {
      reads += 1;
      if (reads === 2) releaseReads();
      await readsComplete;
      if (inserted) throw uniqueShopError();
      inserted = true;
      return record;
    });
    findUnique.mockImplementation(async ({ where }) =>
      inserted && where.shop === shop ? record : null,
    );

    const results = await Promise.all([
      getSitemapState(shop),
      getSitemapState(shop),
    ]);

    expect(results).toHaveLength(2);
    expect(results.every((state) => state.shop === shop)).toBe(true);
    expect(results.every((state) => state.config.layout === DEFAULT_SITEMAP_CONFIG.layout)).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(findUnique).toHaveBeenCalledExactlyOnceWith({ where: { shop } });
  });

  it("keeps the existing shop's settings when initialization loses the insert race", async () => {
    const shop = "saved-shop.myshopify.com";
    const config = { ...DEFAULT_SITEMAP_CONFIG, accentColor: "#123456" };
    const record = { ...shopRecord(shop), configJson: JSON.stringify(config) };
    upsert.mockRejectedValueOnce(uniqueShopError());
    findUnique.mockResolvedValueOnce(record);

    const state = await getSitemapState(shop);

    expect(state.config.accentColor).toBe("#123456");
    expect(upsert).toHaveBeenCalledOnce();
    expect(findUnique).toHaveBeenCalledWith({ where: { shop } });
  });

  it("does not swallow a unique error when the requested shop still does not exist", async () => {
    const error = uniqueShopError();
    upsert.mockRejectedValueOnce(error);
    findUnique.mockResolvedValueOnce(null);

    await expect(ensureSitemapShop("missing-shop.myshopify.com")).rejects.toBe(error);
  });

  it("keeps unrelated database failures visible instead of returning another shop", async () => {
    const error = new Error("Database unavailable");
    upsert.mockRejectedValueOnce(error);

    await expect(ensureSitemapShop("failed-shop.myshopify.com")).rejects.toBe(error);
    expect(findUnique).not.toHaveBeenCalled();
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

function uniqueShopError() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.16.3",
    meta: { modelName: "SitemapShop", target: ["shop"] },
  });
}

function shopRecord(shop: string) {
  return {
    id: "new-shop-id",
    shop,
    configJson: JSON.stringify(DEFAULT_SITEMAP_CONFIG),
    manifestJson: null,
    lastSyncedAt: null,
    lastSyncStatus: "NEVER_SYNCED",
    lastSyncError: null,
    totalLinks: 0,
    truncated: false,
    sitemapPageId: null,
    sitemapPageHandle: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}
