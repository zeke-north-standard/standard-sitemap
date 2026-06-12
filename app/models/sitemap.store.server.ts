import prisma from "~/db.server";
import { DEFAULT_SITEMAP_CONFIG, parseSitemapConfig } from "./sitemap.config";
import {
  SITEMAP_SECTIONS,
  type SitemapConfig,
  type SitemapLink,
  type SitemapManifest,
  type SitemapSection,
  type SitemapSnapshot,
} from "./sitemap.types";

const EMPTY_MANIFEST: SitemapManifest = {
  version: 1,
  generatedAt: new Date(0).toISOString(),
  locale: "primary",
  totalLinks: 0,
  maxLinks: 5000,
  chunks: {},
  truncated: false,
  truncatedSections: [],
};

export async function ensureSitemapShop(shop: string) {
  return prisma.sitemapShop.upsert({
    where: { shop },
    create: {
      shop,
      configJson: JSON.stringify(DEFAULT_SITEMAP_CONFIG),
    },
    update: {},
  });
}

export async function getSitemapState(shop: string) {
  const record = await ensureSitemapShop(shop);
  return {
    ...record,
    config: parseSitemapConfig(JSON.parse(record.configJson)),
    manifest: record.manifestJson
      ? (JSON.parse(record.manifestJson) as SitemapManifest)
      : null,
  };
}

export async function saveSitemapConfig(shop: string, config: SitemapConfig) {
  return prisma.sitemapShop.upsert({
    where: { shop },
    create: {
      shop,
      configJson: JSON.stringify(config),
    },
    update: {
      configJson: JSON.stringify(config),
    },
  });
}

export async function saveSitemapSnapshot(
  shop: string,
  snapshot: SitemapSnapshot,
  chunks: Array<{ section: string; chunkIndex: number; links: SitemapLink[] }>,
) {
  await prisma.$transaction(async (tx) => {
    await tx.sitemapShop.upsert({
      where: { shop },
      create: {
        shop,
        configJson: JSON.stringify(snapshot.config),
        manifestJson: JSON.stringify(snapshot.manifest),
        lastSyncedAt: new Date(snapshot.manifest.generatedAt),
        lastSyncStatus: "SYNCED",
        lastSyncError: null,
        totalLinks: snapshot.manifest.totalLinks,
        truncated: snapshot.manifest.truncated,
      },
      update: {
        configJson: JSON.stringify(snapshot.config),
        manifestJson: JSON.stringify(snapshot.manifest),
        lastSyncedAt: new Date(snapshot.manifest.generatedAt),
        lastSyncStatus: "SYNCED",
        lastSyncError: null,
        totalLinks: snapshot.manifest.totalLinks,
        truncated: snapshot.manifest.truncated,
      },
    });

    await tx.sitemapChunk.deleteMany({ where: { shop } });
    for (const chunk of chunks) {
      await tx.sitemapChunk.create({
        data: {
          shop,
          section: chunk.section,
          chunkIndex: chunk.chunkIndex,
          payloadJson: JSON.stringify(chunk.links),
          linkCount: chunk.links.length,
        },
      });
    }
  });
}

export async function markSitemapSyncFailed(shop: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await prisma.sitemapShop.upsert({
    where: { shop },
    create: {
      shop,
      configJson: JSON.stringify(DEFAULT_SITEMAP_CONFIG),
      lastSyncStatus: "FAILED",
      lastSyncError: message,
    },
    update: {
      lastSyncStatus: "FAILED",
      lastSyncError: message,
    },
  });
}

export async function loadSnapshotForShop(shop: string): Promise<SitemapSnapshot> {
  const record = await getSitemapState(shop);
  const chunks = await prisma.sitemapChunk.findMany({
    where: { shop },
    orderBy: [{ section: "asc" }, { chunkIndex: "asc" }],
  });

  const linksBySection = new Map<string, SitemapLink[]>();
  chunks.forEach((chunk) => {
    const current = linksBySection.get(chunk.section) ?? [];
    linksBySection.set(chunk.section, [
      ...current,
      ...(JSON.parse(chunk.payloadJson) as SitemapLink[]),
    ]);
  });

  const sections: SitemapSection[] = record.config.sectionOrder
    .filter((key) => SITEMAP_SECTIONS.includes(key))
    .map((key) => ({
      key,
      title: sectionTitle(key),
      links: linksBySection.get(key) ?? [],
    }));

  return {
    config: record.config,
    manifest: record.manifest ?? EMPTY_MANIFEST,
    sections,
  };
}

export async function saveSitemapPage(
  shop: string,
  page: { id: string; handle: string },
) {
  await prisma.sitemapShop.update({
    where: { shop },
    data: {
      sitemapPageId: page.id,
      sitemapPageHandle: page.handle,
    },
  });
}

function sectionTitle(key: string) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}
