import { describe, expect, it } from "vitest";
import { DEFAULT_SITEMAP_CONFIG } from "~/models/sitemap.config";
import {
  MAX_TOTAL_LINKS,
  buildChunkedSitemap,
} from "~/models/sitemap.chunking";

describe("buildChunkedSitemap", () => {
  it("orders enabled sections and chunks links", () => {
    const result = buildChunkedSitemap({
      config: {
        ...DEFAULT_SITEMAP_CONFIG,
        enabledSections: ["products", "collections"],
        sectionOrder: ["collections", "products"],
      },
      locale: "primary",
      now: new Date("2026-05-29T12:00:00.000Z"),
      sections: [
        {
          key: "products",
          links: Array.from({ length: 350 }, (_, index) => ({
            title: `Product ${index}`,
            url: `/products/product-${index}`,
          })),
        },
        {
          key: "collections",
          links: [{ title: "Summer", url: "/collections/summer" }],
        },
      ],
    });

    expect(result.snapshot.sections.map((section) => section.key)).toEqual([
      "collections",
      "products",
    ]);
    expect(result.snapshot.manifest.totalLinks).toBe(351);
    expect(result.snapshot.manifest.chunks.products).toBeGreaterThan(1);
    expect(result.snapshot.manifest.warnings).toEqual([]);
    expect(result.chunks.every((chunk) => chunk.links.length <= 300)).toBe(
      true,
    );
  });

  it("caps snapshots at the v1 link limit", () => {
    const result = buildChunkedSitemap({
      config: {
        ...DEFAULT_SITEMAP_CONFIG,
        enabledSections: ["products"],
        sectionOrder: ["products"],
      },
      locale: "primary",
      sections: [
        {
          key: "products",
          links: Array.from({ length: MAX_TOTAL_LINKS + 10 }, (_, index) => ({
            title: `Product ${index}`,
            url: `/products/product-${index}`,
          })),
        },
      ],
    });

    expect(result.snapshot.manifest.totalLinks).toBe(MAX_TOTAL_LINKS);
    expect(result.snapshot.manifest.truncated).toBe(true);
    expect(result.snapshot.manifest.truncatedSections).toEqual(["products"]);
  });
});
