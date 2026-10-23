import { describe, expect, it } from "vitest";
import { DEFAULT_SITEMAP_CONFIG } from "~/models/sitemap.config";
import {
  MAX_TOTAL_LINKS,
  MAX_CHUNK_BYTES,
  MAX_LINKS_PER_CHUNK,
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

  it("caps snapshots at the link limit", () => {
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

  it("keeps exact-limit stores complete and reports only overflowing sections", () => {
    const links = Array.from({ length: MAX_TOTAL_LINKS }, (_, index) => ({ title: `Product ${index}`, url: `/products/${index}` }));
    const result = buildChunkedSitemap({ config: DEFAULT_SITEMAP_CONFIG, locale: "en", sections: [{ key: "products", links }] });
    expect(result.snapshot.manifest).toMatchObject({ totalLinks: MAX_TOTAL_LINKS, truncated: false });
    const overflow = buildChunkedSitemap({ config: DEFAULT_SITEMAP_CONFIG, locale: "en", sections: [{ key: "products", links }, { key: "pages", links: [{ title: "About", url: "/pages/about" }] }] });
    expect(overflow.snapshot.manifest.truncatedSections).toEqual(["pages"]);
  });

  it("removes blank and duplicate links after trimming without dropping distinct labels", () => {
    const result = buildChunkedSitemap({
      config: DEFAULT_SITEMAP_CONFIG, locale: "en",
      sections: [{ key: "products", links: [
        { title: " Compass ", url: " /products/compass " },
        { title: "Compass", url: "/products/compass" },
        { title: " ", url: "/products/missing-title" },
        { title: "Missing URL", url: " " },
        { title: "Compass alternate", url: "/products/compass" },
      ] }],
    });
    expect(result.snapshot.manifest.totalLinks).toBe(2);
    expect(result.snapshot.sections.find((section) => section.key === "products")?.links[0]).toEqual({ title: "Compass", url: "/products/compass" });
  });

  it("counts UTF-8 bytes and JSON escapes while chunking large multilingual stores", () => {
    const links = Array.from({ length: 5000 }, (_, index) => ({ title: `商品${index} ${'🌍"\\'.repeat(50)}`, url: `/products/product-${index}` }));
    const result = buildChunkedSitemap({ config: DEFAULT_SITEMAP_CONFIG, locale: "en", sections: [{ key: "products", links }] });
    expect(result.snapshot.manifest.totalLinks).toBe(5000);
    expect(result.chunks.every((chunk) => chunk.links.length <= MAX_LINKS_PER_CHUNK && Buffer.byteLength(JSON.stringify(chunk.links), "utf8") <= MAX_CHUNK_BYTES)).toBe(true);
    expect(result.chunks.flatMap((chunk) => chunk.links)).toEqual(links);
    expect(result.chunks.map((chunk) => chunk.chunkIndex)).toEqual(result.chunks.map((_, index) => index));
    expect(result.snapshot.manifest.chunks.products).toBe(result.chunks.length);
  });

  it("stores only crawlable web URLs instead of executable or action navigation links", () => {
    const urls = ["/pages/about", "https://example.org/story", "http://example.org/archive", "javascript:alert(1)", "java\nscript:alert(1)", "data:text/html,<script>alert(1)</script>", "mailto:hello@example.org", "tel:+15555555555", "#menu", "//untrusted.example/path", "/\\untrusted.example/path", "https://name:password@example.org/path"];
    const result = buildChunkedSitemap({ config: DEFAULT_SITEMAP_CONFIG, locale: "en", sections: [{ key: "navigation", links: urls.map((url) => ({ title: "Navigation", url })) }] });
    expect(result.snapshot.manifest.totalLinks).toBe(3);
    expect(result.chunks.flatMap((chunk) => chunk.links.map((link) => link.url))).toEqual(urls.slice(0, 3));
  });
});
