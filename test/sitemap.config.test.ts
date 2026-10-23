import { describe, expect, it } from "vitest";
import { configFromFormData, DEFAULT_SITEMAP_CONFIG, parseSitemapConfig } from "~/models/sitemap.config";

describe("parseSitemapConfig", () => {
  it("falls back to safe defaults for invalid settings", () => {
    const config = parseSitemapConfig({
      layout: "wild",
      columns: 99,
      accentColor: "green",
      textColor: "#111111",
      enabledSections: ["products"],
      sectionOrder: ["articles", "products"],
    });

    expect(config.layout).toBe("directory");
    expect(config.columns).toBe(4);
    expect(config.accentColor).toBe("#007a5c");
    expect(config.textColor).toBe("#111111");
    expect(config.enabledSections).toEqual(["products"]);
    expect(config.sectionOrder).toEqual(["products"]);
  });

  it("preserves explicitly excluded sections instead of turning everything back on", () => {
    const form = new FormData();
    form.set("layout", "compact");
    expect(configFromFormData(form)).toMatchObject({
      layout: "compact", columns: 3, enabledSections: [], sectionOrder: [],
      showCounts: false, showLastUpdated: false,
    });
    expect(parseSitemapConfig({ enabledSections: [] }).enabledSections).toEqual([]);
    expect(parseSitemapConfig({}).enabledSections).toEqual(DEFAULT_SITEMAP_CONFIG.enabledSections);
  });

  it("deduplicates section choices and ordering without duplicating generated sections", () => {
    expect(parseSitemapConfig({
      enabledSections: ["products", "products", "pages", "unknown"],
      sectionOrder: ["pages", "pages", "products"],
    })).toMatchObject({ enabledSections: ["products", "pages"], sectionOrder: ["pages", "products"] });
  });

  it("uses boolean defaults for invalid stored display switches", () => {
    expect(parseSitemapConfig({ showCounts: "false", showLastUpdated: "false" })).toMatchObject({
      showCounts: true, showLastUpdated: false,
    });
  });
});
