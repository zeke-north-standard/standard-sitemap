import { describe, expect, it } from "vitest";
import { parseSitemapConfig } from "~/models/sitemap.config";

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
});
