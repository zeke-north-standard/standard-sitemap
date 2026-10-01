import { describe, expect, it, vi } from "vitest";
import {
  addSitemapLinkToMenu,
  listSitemapMenus,
} from "~/models/sitemap.navigation.server";
import type { GraphqlClient } from "~/models/shopify-graphql.server";

const MENU_ID = "gid://shopify/Menu/123";
const SHOP = "example.myshopify.com";

function createClient(responses: Array<Record<string, unknown>>) {
  const graphql = vi.fn<GraphqlClient["graphql"]>(async () => {
      const data = responses.shift();
      if (!data) throw new Error("Unexpected GraphQL request.");
      return new Response(JSON.stringify({ data }));
  });
  return { graphql } as unknown as GraphqlClient & { graphql: typeof graphql };
}

function existingMenu() {
  return {
    id: MENU_ID,
    title: "Footer menu",
    handle: "footer",
    items: [
      {
        id: "gid://shopify/MenuItem/10",
        title: "Policies",
        type: "SHOP_POLICY",
        url: "/policies/privacy-policy",
        resourceId: "gid://shopify/ShopPolicy/10",
        tags: [],
        items: [
          {
            id: "gid://shopify/MenuItem/11",
            title: "Returns",
            type: "HTTP",
            url: "/policies/refund-policy",
            resourceId: null,
            tags: [],
            items: [],
          },
        ],
      },
    ],
  };
}

describe("sitemap footer navigation", () => {
  it("places the footer menu first and reports an existing link", async () => {
    const client = createClient([
      {
        menus: {
          nodes: [
            {
              id: "gid://shopify/Menu/9",
              title: "Main",
              handle: "main-menu",
              items: [],
            },
            {
              id: MENU_ID,
              title: "Footer menu",
              handle: "footer",
              items: [
                {
                  url: "https://example.myshopify.com/apps/html-sitemap",
                  items: [],
                },
              ],
            },
          ],
        },
      },
    ]);

    const menus = await listSitemapMenus(client);
    expect(menus[0]).toMatchObject({ id: MENU_ID, hasSitemapLink: true });
  });

  it("appends a sitemap link without changing existing nested links", async () => {
    const client = createClient([
      { menu: existingMenu() },
      { menuUpdate: { menu: { id: MENU_ID }, userErrors: [] } },
    ]);

    expect(await addSitemapLinkToMenu(client, SHOP, MENU_ID)).toEqual({
      added: true,
      menuTitle: "Footer menu",
    });
    const variables = client.graphql.mock.calls[1][1]?.variables as {
      id: string;
      title: string;
      items: Array<Record<string, unknown>>;
    };
    expect(variables.id).toBe(MENU_ID);
    expect(variables.items[0]).toMatchObject({
      id: "gid://shopify/MenuItem/10",
      items: [{ id: "gid://shopify/MenuItem/11", title: "Returns" }],
    });
    expect(variables.items[1]).toEqual({
      title: "Sitemap",
      type: "HTTP",
      url: `https://${SHOP}/apps/html-sitemap`,
    });
  });

  it("does not add a second link when one already exists", async () => {
    const menu = existingMenu();
    menu.items[0].items[0].url = "/apps/html-sitemap";
    const client = createClient([{ menu }]);

    expect(await addSitemapLinkToMenu(client, SHOP, MENU_ID)).toEqual({
      added: false,
      menuTitle: "Footer menu",
    });
    expect(client.graphql).toHaveBeenCalledTimes(1);
  });
});
