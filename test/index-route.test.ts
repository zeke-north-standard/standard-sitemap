import { describe, expect, it } from "vitest";
import { loader } from "../app/routes/_index";

describe("root route", () => {
  it("preserves Shopify launch parameters when entering the embedded app", async () => {
    const response = await loader({
      request: new Request(
        "https://example.com/?shop=test-shop.myshopify.com&host=encoded-host&embedded=1",
      ),
    } as never);

    expect(response.headers.get("location")).toBe(
      "/app?shop=test-shop.myshopify.com&host=encoded-host&embedded=1",
    );
  });

  it("sends direct visits to the login page", async () => {
    const response = await loader({
      request: new Request("https://example.com/"),
    } as never);

    expect(response.headers.get("location")).toBe("/auth/login");
  });
});
