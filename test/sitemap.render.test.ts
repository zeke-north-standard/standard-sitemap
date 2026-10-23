import { describe, expect, it } from "vitest";
import { DEFAULT_SITEMAP_CONFIG } from "~/models/sitemap.config";
import {
  renderSitemapDocument,
  renderSitemapLiquid,
  renderSitemapMarkup,
} from "~/models/sitemap.render";
import { buildChunkedSitemap } from "~/models/sitemap.chunking";

describe("renderSitemapMarkup", () => {
  it("lets Shopify wrap the proxy response in the store theme", () => {
    const liquid = renderSitemapLiquid({
      config: DEFAULT_SITEMAP_CONFIG,
      manifest: {
        version: 1,
        generatedAt: "2026-05-29T12:00:00.000Z",
        locale: "en",
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
          links: [{ title: "Compass", url: "/products/compass" }],
        },
      ],
    });

    expect(liquid).not.toContain("{% layout none %}");
    expect(liquid).toContain('<h1 class="html-sitemap__title">Sitemap</h1>');
    expect(liquid).toContain('href="/products/compass"');
  });

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

  it("renders a complete preview document with storefront-relative links", () => {
    const html = renderSitemapDocument(
      {
        config: DEFAULT_SITEMAP_CONFIG,
        manifest: {
          version: 1,
          generatedAt: "2026-05-29T12:00:00.000Z",
          locale: "en",
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
            links: [{ title: "Compass", url: "/products/compass" }],
          },
        ],
      },
      "example.myshopify.com",
    );

    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<base href="https://example.myshopify.com">');
    expect(html).toContain('href="/products/compass"');
  });

  it("renders an empty new-store sitemap without a crash or empty sections", () => {
    const { snapshot } = buildChunkedSitemap({ config: DEFAULT_SITEMAP_CONFIG, locale: "primary", sections: [] });
    const html = renderSitemapMarkup(snapshot);
    expect(html).toContain("No sitemap links are available yet.");
    expect(html).not.toContain('<section class="html-sitemap__section"');
  });

  it("escapes merchant HTML, attributes, and Liquid in proxy content", () => {
    const { snapshot } = buildChunkedSitemap({
      config: DEFAULT_SITEMAP_CONFIG,
      locale: "en",
      sections: [{ key: "products", links: [{ title: '<img src=x onerror="alert(1)"> {{ shop.email }} {% render "secret" %} & \'quoted\'', url: '/products/compass?q=" onmouseover="alert(1)&liquid={{shop.email}}' }] }],
    });
    const html = renderSitemapLiquid(snapshot);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("{{");
    expect(html).not.toContain("{%");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&#123;&#123; shop.email &#125;&#125;");
    expect(html).toContain("&amp; &#39;quoted&#39;");
    expect(html).toContain('href="/products/compass?q=&quot; onmouseover=&quot;alert(1)&amp;liquid=');
  });

  it("does not crash previews when an optional source date is malformed", () => {
    const { snapshot } = buildChunkedSitemap({
      config: { ...DEFAULT_SITEMAP_CONFIG, showLastUpdated: true },
      locale: "en",
      sections: [{ key: "products", links: [{ title: "Compass", url: "/products/compass", updatedAt: "not a date" }] }],
    });
    expect(() => renderSitemapDocument(snapshot, "example.myshopify.com")).not.toThrow();
    expect(renderSitemapMarkup(snapshot)).toContain("Compass");
    expect(renderSitemapMarkup(snapshot)).not.toContain('class="html-sitemap__link-date"');
  });

  it("filters unsafe URLs in previously saved snapshots and renders accurate visible counts", () => {
    const { snapshot } = buildChunkedSitemap({ config: DEFAULT_SITEMAP_CONFIG, locale: "en", sections: [{ key: "navigation", links: [{ title: "About", url: "/pages/about" }] }] });
    snapshot.sections[0].links.push({ title: "Unsafe", url: "javascript:alert(1)" });
    const html = renderSitemapMarkup(snapshot);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("Unsafe");
    expect(html).toContain('<span class="html-sitemap__count">1</span>');
  });
});
