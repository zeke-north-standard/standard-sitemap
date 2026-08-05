import { describe, expect, it, vi } from "vitest";
import { verifySitemapPublication } from "~/models/sitemap.publication.server";

describe("verifySitemapPublication", () => {
  it("confirms server-rendered sitemap links", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          '<div class="html-sitemap"><a class="html-sitemap__link" href="/products/compass">Compass</a></div>',
          { status: 200 },
        ),
    ) as unknown as typeof fetch;

    const result = await verifySitemapPublication(
      "https://example.myshopify.com/apps/html-sitemap",
      fetcher,
    );

    expect(result.status).toBe("LIVE");
    expect(result.linkCount).toBe(1);
  });

  it("explains when the storefront password blocks verification", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response('<form><input name="password"></form>', { status: 200 }),
    ) as unknown as typeof fetch;

    const result = await verifySitemapPublication(
      "https://example.myshopify.com/apps/html-sitemap",
      fetcher,
    );

    expect(result.status).toBe("PASSWORD_PROTECTED");
    expect(result.tone).toBe("warning");
  });

  it("reports a missing app proxy route", async () => {
    const fetcher = vi.fn(
      async () => new Response("Not found", { status: 404 }),
    ) as unknown as typeof fetch;

    const result = await verifySitemapPublication(
      "https://example.myshopify.com/apps/html-sitemap",
      fetcher,
    );

    expect(result.status).toBe("NOT_FOUND");
    expect(result.tone).toBe("critical");
  });
});
