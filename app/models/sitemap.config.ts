import {
  SITEMAP_SECTIONS,
  type SitemapConfig,
  type SitemapSectionKey,
} from "./sitemap.types";

const COLOR_HEX = /^#[0-9a-f]{6}$/i;

export const DEFAULT_SITEMAP_CONFIG: SitemapConfig = {
  layout: "directory",
  columns: 3,
  accentColor: "#007a5c",
  textColor: "#202223",
  backgroundMode: "transparent",
  headingSize: "medium",
  spacingDensity: "balanced",
  showCounts: true,
  showLastUpdated: false,
  enabledSections: [...SITEMAP_SECTIONS],
  sectionOrder: [...SITEMAP_SECTIONS],
};

export function parseSitemapConfig(value: unknown): SitemapConfig {
  if (!value || typeof value !== "object") {
    return DEFAULT_SITEMAP_CONFIG;
  }

  const input = value as Partial<SitemapConfig>;
  const enabledSections = normalizeSections(input.enabledSections);
  const sectionOrder = normalizeSectionOrder(input.sectionOrder, enabledSections);

  return {
    layout: ["compact", "directory", "editorial"].includes(String(input.layout))
      ? (input.layout as SitemapConfig["layout"])
      : DEFAULT_SITEMAP_CONFIG.layout,
    columns: clampInteger(input.columns, 1, 4, DEFAULT_SITEMAP_CONFIG.columns),
    accentColor: validColor(input.accentColor, DEFAULT_SITEMAP_CONFIG.accentColor),
    textColor: validColor(input.textColor, DEFAULT_SITEMAP_CONFIG.textColor),
    backgroundMode: ["transparent", "soft", "contrast"].includes(
      String(input.backgroundMode),
    )
      ? (input.backgroundMode as SitemapConfig["backgroundMode"])
      : DEFAULT_SITEMAP_CONFIG.backgroundMode,
    headingSize: ["small", "medium", "large"].includes(String(input.headingSize))
      ? (input.headingSize as SitemapConfig["headingSize"])
      : DEFAULT_SITEMAP_CONFIG.headingSize,
    spacingDensity: ["tight", "balanced", "roomy"].includes(
      String(input.spacingDensity),
    )
      ? (input.spacingDensity as SitemapConfig["spacingDensity"])
      : DEFAULT_SITEMAP_CONFIG.spacingDensity,
    showCounts: input.showCounts ?? DEFAULT_SITEMAP_CONFIG.showCounts,
    showLastUpdated:
      input.showLastUpdated ?? DEFAULT_SITEMAP_CONFIG.showLastUpdated,
    enabledSections,
    sectionOrder,
  };
}

export function configFromFormData(formData: FormData): SitemapConfig {
  const enabledSections = SITEMAP_SECTIONS.filter(
    (section) => formData.get(`enabled:${section}`) === "on",
  );

  return parseSitemapConfig({
    layout: formData.get("layout"),
    columns: Number(formData.get("columns")),
    accentColor: formData.get("accentColor"),
    textColor: formData.get("textColor"),
    backgroundMode: formData.get("backgroundMode"),
    headingSize: formData.get("headingSize"),
    spacingDensity: formData.get("spacingDensity"),
    showCounts: formData.get("showCounts") === "on",
    showLastUpdated: formData.get("showLastUpdated") === "on",
    enabledSections,
    sectionOrder: SITEMAP_SECTIONS,
  });
}

function normalizeSections(value: unknown): SitemapSectionKey[] {
  if (!Array.isArray(value)) {
    return DEFAULT_SITEMAP_CONFIG.enabledSections;
  }

  const known = value.filter((section): section is SitemapSectionKey =>
    SITEMAP_SECTIONS.includes(section as SitemapSectionKey),
  );

  return known.length > 0 ? known : DEFAULT_SITEMAP_CONFIG.enabledSections;
}

function normalizeSectionOrder(
  value: unknown,
  enabledSections: SitemapSectionKey[],
): SitemapSectionKey[] {
  const order = Array.isArray(value) ? value : DEFAULT_SITEMAP_CONFIG.sectionOrder;
  const ordered = order.filter((section): section is SitemapSectionKey =>
    enabledSections.includes(section as SitemapSectionKey),
  );
  const missing = enabledSections.filter((section) => !ordered.includes(section));
  return [...ordered, ...missing];
}

function clampInteger(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function validColor(value: unknown, fallback: string) {
  return typeof value === "string" && COLOR_HEX.test(value) ? value : fallback;
}
