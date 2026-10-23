import { afterEach, describe, expect, it, vi } from "vitest";
import { verifySitemapPublication } from "~/models/sitemap.publication.server";

describe("verifySitemapPublication", () => {
  afterEach(() => vi.useRealTimers());
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
        new Response('<form action="/password"><input name="password"></form>', { status: 200 }),
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

  it("does not report an empty new-install sitemap as live", async () => {
    const fetcher = vi.fn(async () => new Response(
      '<div class="html-sitemap"><p>No sitemap links are available yet.</p></div>',
    )) as unknown as typeof fetch;

    expect(await verifySitemapPublication("https://example.myshopify.com/apps/html-sitemap", fetcher))
      .toMatchObject({ status: "NOT_GENERATED", tone: "warning", linkCount: 0 });
  });

  it("allows a live theme with a customer login password input", async () => {
    const fetcher = vi.fn(async () => new Response(
      '<form action="/account/login"><input name="password"></form><div class="html-sitemap"><a class="html-sitemap__link" href="/pages/about">About</a></div>',
    )) as unknown as typeof fetch;

    expect(await verifySitemapPublication("https://example.myshopify.com/apps/html-sitemap", fetcher))
      .toMatchObject({ status: "LIVE", linkCount: 1 });
  });

  it("bounds a stalled storefront check and returns a retryable result", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("Timed out")), { once: true });
    })) as unknown as typeof fetch;
    // AbortSignal.timeout uses a native clock; trigger the supplied signal in this
    // isolated transport instead of waiting ten seconds in the test process.
    const abort = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(abort.signal);
    const result = verifySitemapPublication("https://example.myshopify.com/apps/html-sitemap", fetcher);
    abort.abort();

    expect(await result).toMatchObject({ status: "UNAVAILABLE", tone: "critical" });
    expect(timeout).toHaveBeenCalledWith(10_000);
    timeout.mockRestore();
  });

  it.each([403, 429, 500, 503])("explains HTTP %s instead of throwing", async (status) => {
    const fetcher = vi.fn(async () => new Response("Unavailable", { status })) as unknown as typeof fetch;
    expect(await verifySitemapPublication("https://example.myshopify.com/apps/html-sitemap", fetcher))
      .toMatchObject({ status: "UNAVAILABLE", linkCount: 0 });
  });
});
