import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Liquid } from "liquidjs";
import { describe, expect, it } from "vitest";

// These fixtures check template behavior, not native Shopify/theme integration.
const root = fileURLToPath(new URL("../extensions/html-sitemap/", import.meta.url));
const source = fs.readFileSync(path.join(root, "blocks/html-sitemap.liquid"), "utf8");
const schema = JSON.parse(source.match(/{% schema %}([\s\S]+?){% endschema %}/)![1]);
const defaults = Object.fromEntries(schema.settings.map((setting: { id: string; default: unknown }) => [setting.id, setting.default]));
const prepare = (value: string) => value
  .replace(/{%\s*schema\s*%}[\s\S]*?{%\s*endschema\s*%}/g, "")
  // LiquidJS does not impose Shopify's documented 50-iteration cap. Fail a
  // fixture if any actual loop would cross it, including loops in snippets.
  .replace(/({%\s*for\b[^%]*%})/g, "$1{{ forloop.length | assert_loop_limit }}");

describe("HTML sitemap app-block Liquid fixtures", () => {
  async function render(chunks: Array<Array<{ title: string; url: string }>>, config: Record<string, unknown> = {}, settings: Record<string, unknown> = {}) {
    // Compile each unchanged snippet once, as a deployed theme does. The large
    // fixture exercises Liquid bounds rather than repeated filesystem reads.
    const engine = new Liquid({ root: [path.join(root, "snippets")], extname: ".liquid", strictFilters: true, cache: true });
    const originalFs = engine.options.fs;
    engine.options.fs = { ...originalFs, readFile: async (file: string) => prepare(await originalFs.readFile(file)) };
    engine.registerFilter("assert_loop_limit", (length: number) => { if (length > 50) throw new Error(`Shopify Liquid iteration cap exceeded: ${length}`); return ""; });
    const fields: Record<string, unknown> = {
      manifest: { value: { chunks: { products: chunks.length }, generatedAt: "2026-10-23T00:00:00Z" } },
      config: { value: { sectionOrder: ["products"], ...config } },
    };
    chunks.forEach((links, index) => { fields[`products_${index}`] = { value: links }; });
    return engine.parseAndRender(prepare(source), {
      app: { metafields: { html_sitemap: fields } },
      block: { settings: { ...defaults, ...settings } },
    }) as Promise<string>;
  }

  const links = (count: number, offset = 0) => Array.from({ length: count }, (_value, index) => ({ title: `Product ${index + offset}`, url: `/products/item-${index + offset}` }));

  it.each([51, 300])("renders all %s links from one JSON chunk without crossing any Liquid loop cap", async (count) => {
    const html = await render([links(count)]);
    expect((html.match(/class="html-sitemap__link"/g) ?? []).length).toBe(count);
    expect(html).toContain(`href="/products/item-${count - 1}"`);
    expect(html).toMatch(new RegExp(`class="html-sitemap__count">\\s*${count}\\s*<`));
    expect(html.indexOf('item-0"')).toBeLessThan(html.indexOf(`item-${count - 1}"`));
  });

  it.each([51, 5000])("renders and counts %s small chunks while every loop remains bounded", async (count) => {
    const html = await render(Array.from({ length: count }, (_value, index) => links(1, index)));
    expect((html.match(/class="html-sitemap__link"/g) ?? []).length).toBe(count);
    expect(html).toContain(`href="/products/item-${count - 1}"`);
    expect(html).toMatch(new RegExp(`class="html-sitemap__count">\\s*${count}\\s*<`));
  }, 20_000);

  it("honors explicit false saved settings even when theme defaults enable them", async () => {
    const html = await render([links(1)], { showCounts: false, showLastUpdated: false }, { show_counts: true, show_last_updated: true });
    expect(html).not.toContain('class="html-sitemap__count"');
    expect(html).not.toContain('class="html-sitemap__updated"');
    expect(html).toContain('class="html-sitemap__link"');
  });

  it("shows the new-install empty state and honors a hidden theme section", async () => {
    expect(await render([])).toContain("No sitemap links are available yet.");
    const hidden = await render([links(1)], {}, { show_products: false });
    expect(hidden).not.toContain('class="html-sitemap__link"');
    expect(hidden).toContain("No sitemap links are available yet.");
  });
});
