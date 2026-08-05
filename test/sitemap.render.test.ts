import { describe, expect, it } from "vitest";
import { DEFAULT_SITEMAP_CONFIG } from "~/models/sitemap.config";
import { renderSitemapMarkup } from "~/models/sitemap.render";

describe("renderSitemapMarkup", () => {
  it("renders crawlable links in the initial HTML", () => {
    const html = renderSitemapMarkup({
      config: DEFAULT_SITEMAP_CONFIG,
      manifest: {
        version: 1,
        generatedAt: "2026-05-29T12:00:00.000Z",
        locale: "primary",
        totalLinks: 1,
        maxLinks: 5000,
        chunks: { products: 1 },
        truncated: false,
        truncatedSections: [],
        warnings: [],
      },
      sections: [
        {
          key: "products",
          title: "Products",
          links: [
            {
              title: "SEO <Boost>",
              url: "/products/seo-boost",
            },
          ],
        },
      ],
    });

    expect(html).toContain(
      '<a class="html-sitemap__link" href="/products/seo-boost">',
    );
    expect(html).toContain("SEO &lt;Boost&gt;");
    expect(html).not.toContain("<script");
  });
});
