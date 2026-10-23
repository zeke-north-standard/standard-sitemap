import { describe, expect, it, vi } from "vitest";
import { graphqlRequest, publicPathFromOnlineStoreUrl } from "~/models/shopify-graphql.server";

function client(response: Response) {
  return { graphql: vi.fn(async () => response) };
}

describe("Shopify GraphQL boundary", () => {
  it("returns successful data and passes variables through unchanged", async () => {
    const admin = client(Response.json({ data: { products: { nodes: [] } } }));
    expect(await graphqlRequest(admin, "query Products { products { nodes { id } } }", { first: 250 })).toEqual({ products: { nodes: [] } });
    expect(admin.graphql).toHaveBeenCalledWith(expect.any(String), { variables: { first: 250 } });
  });

  it("rejects partial GraphQL errors rather than storing incomplete results", async () => {
    const admin = client(Response.json({ data: { products: null }, errors: [{ message: "Access denied" }] }));
    await expect(graphqlRequest(admin, "query")).rejects.toThrow("Access denied");
  });

  it("rejects missing data", async () => {
    await expect(graphqlRequest(client(Response.json({ data: null })), "query")).rejects.toThrow("no GraphQL data");
  });

  it.each([401, 429, 503])("rejects HTTP %i even when the body contains data", async (status) => {
    const admin = client(Response.json({ data: { products: [] } }, { status }));
    await expect(graphqlRequest(admin, "query")).rejects.toThrow(status === 429 ? "limiting requests" : `HTTP ${status}`);
  });

  it("propagates network failures without producing data", async () => {
    const admin = { graphql: vi.fn(async () => { throw new Error("network down"); }) };
    await expect(graphqlRequest(admin, "query")).rejects.toThrow("network down");
  });

  it("converts canonical storefront links to relative paths and uses missing-URL fallbacks", () => {
    expect(publicPathFromOnlineStoreUrl("https://shop.example/products/compass?view=full#details", "/fallback")).toBe("/products/compass?view=full#details");
    expect(publicPathFromOnlineStoreUrl(null, "/products/compass")).toBe("/products/compass");
    expect(publicPathFromOnlineStoreUrl("not a URL", "/fallback")).toBe("/fallback");
  });
});
