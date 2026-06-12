import {
  SITEMAP_SECTIONS,
  type SitemapChunkManifest,
  type SitemapConfig,
  type SitemapLink,
  type SitemapManifest,
  type SitemapSection,
  type SitemapSectionKey,
  type SitemapSnapshot,
} from "./sitemap.types";

export const MAX_TOTAL_LINKS = 5000;
export const MAX_LINKS_PER_CHUNK = 300;
export const MAX_CHUNK_BYTES = 60000;

const SECTION_TITLES: Record<SitemapSectionKey, string> = {
  navigation: "Navigation",
  collections: "Collections",
  products: "Products",
  pages: "Pages",
  articles: "Articles",
  policies: "Policies",
};

export interface BuildSnapshotInput {
  config: SitemapConfig;
  locale: string;
  sections: Array<Pick<SitemapSection, "key" | "links">>;
  now?: Date;
}

export interface ChunkedSitemap {
  snapshot: SitemapSnapshot;
  chunks: Array<{
    section: SitemapSectionKey;
    chunkIndex: number;
    links: SitemapLink[];
  }>;
}

export function buildChunkedSitemap(input: BuildSnapshotInput): ChunkedSitemap {
  const available = new Map(input.sections.map((section) => [section.key, section]));
  const orderedSections = input.config.sectionOrder
    .filter((key) => input.config.enabledSections.includes(key))
    .filter((key) => SITEMAP_SECTIONS.includes(key));

  let remaining = MAX_TOTAL_LINKS;
  let truncated = false;
  const truncatedSections: SitemapSectionKey[] = [];
  const chunks: ChunkedSitemap["chunks"] = [];
  const manifestChunks: SitemapChunkManifest = {};

  const sections: SitemapSection[] = orderedSections.map((key) => {
    const rawLinks = dedupeLinks(available.get(key)?.links ?? []);
    const links = rawLinks.slice(0, Math.max(remaining, 0));
    remaining -= links.length;

    if (links.length < rawLinks.length) {
      truncated = true;
      truncatedSections.push(key);
    }

    const sectionChunks = chunkLinks(links);
    manifestChunks[key] = sectionChunks.length;
    sectionChunks.forEach((chunk, chunkIndex) => {
      chunks.push({ section: key, chunkIndex, links: chunk });
    });

    return {
      key,
      title: SECTION_TITLES[key],
      links,
    };
  });

  const totalLinks = sections.reduce(
    (sum, section) => sum + section.links.length,
    0,
  );

  const manifest: SitemapManifest = {
    version: 1,
    generatedAt: (input.now ?? new Date()).toISOString(),
    locale: input.locale || "primary",
    totalLinks,
    maxLinks: MAX_TOTAL_LINKS,
    chunks: manifestChunks,
    truncated,
    truncatedSections,
  };

  return {
    snapshot: {
      config: input.config,
      manifest,
      sections,
    },
    chunks,
  };
}

function dedupeLinks(links: SitemapLink[]) {
  const seen = new Set<string>();
  return links
    .filter((link) => link.title.trim() && link.url.trim())
    .map((link) => ({
      ...link,
      title: link.title.trim(),
      url: link.url.trim(),
    }))
    .filter((link) => {
      const key = `${link.title}|${link.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function chunkLinks(links: SitemapLink[]) {
  const chunks: SitemapLink[][] = [];
  let current: SitemapLink[] = [];

  for (const link of links) {
    const next = [...current, link];
    if (
      current.length > 0 &&
      (next.length > MAX_LINKS_PER_CHUNK ||
        Buffer.byteLength(JSON.stringify(next), "utf8") > MAX_CHUNK_BYTES)
    ) {
      chunks.push(current);
      current = [link];
    } else {
      current = next;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}
