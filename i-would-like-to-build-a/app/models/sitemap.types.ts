export const SITEMAP_SECTIONS = [
  "navigation",
  "collections",
  "products",
  "pages",
  "articles",
  "policies",
] as const;

export type SitemapSectionKey = (typeof SITEMAP_SECTIONS)[number];

export type LayoutPreset = "compact" | "directory" | "editorial";
export type BackgroundMode = "transparent" | "soft" | "contrast";
export type HeadingSize = "small" | "medium" | "large";
export type SpacingDensity = "tight" | "balanced" | "roomy";

export interface SitemapLink {
  title: string;
  url: string;
  handle?: string | null;
  updatedAt?: string | null;
}

export interface SitemapSection {
  key: SitemapSectionKey;
  title: string;
  links: SitemapLink[];
}

export interface SitemapConfig {
  layout: LayoutPreset;
  columns: number;
  accentColor: string;
  textColor: string;
  backgroundMode: BackgroundMode;
  headingSize: HeadingSize;
  spacingDensity: SpacingDensity;
  showCounts: boolean;
  showLastUpdated: boolean;
  enabledSections: SitemapSectionKey[];
  sectionOrder: SitemapSectionKey[];
}

export interface SitemapChunkManifest {
  [section: string]: number;
}

export interface SitemapManifest {
  version: number;
  generatedAt: string;
  locale: string;
  totalLinks: number;
  maxLinks: number;
  chunks: SitemapChunkManifest;
  truncated: boolean;
  truncatedSections: SitemapSectionKey[];
}

export interface SitemapSnapshot {
  config: SitemapConfig;
  manifest: SitemapManifest;
  sections: SitemapSection[];
}
