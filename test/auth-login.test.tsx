import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("~/shopify.server", () => ({ login: vi.fn() }));

import Login, { loader } from "../app/routes/auth.login";
import { login } from "~/shopify.server";

describe("auth login route", () => {
  it("does not ask visitors to enter a store domain", () => {
    const markup = renderToStaticMarkup(<Login />);

    expect(markup).toContain("Open North Standard Sitemap Creator from Shopify");
    expect(markup).toContain('href="/support"');
    expect(markup).not.toContain('name="shop"');
  });

  it("preserves Shopify's login redirect when launched with store context", async () => {
    const redirect = Response.redirect("https://example.com/auth/callback");
    vi.mocked(login).mockRejectedValueOnce(redirect);

    await expect(
      loader({
        request: new Request(
          "https://example.com/auth/login?shop=test-shop.myshopify.com",
        ),
      } as never),
    ).rejects.toBe(redirect);
  });
});
