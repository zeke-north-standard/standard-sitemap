import { graphqlRequest, type GraphqlClient } from "./shopify-graphql.server";

const SITEMAP_PATH = "/apps/html-sitemap";

interface MenuLink {
  url: string | null;
  items: MenuLink[];
}

interface MenuItem extends MenuLink {
  id: string;
  title: string;
  type: string;
  resourceId: string | null;
  tags: string[];
  items: MenuItem[];
}

interface MenuSummary {
  id: string;
  title: string;
  handle: string;
  items: MenuLink[];
}

interface Menu extends Omit<MenuSummary, "items"> {
  items: MenuItem[];
}

export async function listSitemapMenus(admin: GraphqlClient) {
  const data = await graphqlRequest<{ menus: { nodes: MenuSummary[] } }>(
    admin,
    LIST_MENUS_QUERY,
  );

  return data.menus.nodes
    .map((menu) => ({
      id: menu.id,
      title: menu.title,
      handle: menu.handle,
      hasSitemapLink: containsSitemapLink(menu.items),
    }))
    .sort(
      (a, b) => footerRank(a) - footerRank(b) || a.title.localeCompare(b.title),
    );
}

export async function addSitemapLinkToMenu(
  admin: GraphqlClient,
  shop: string,
  menuId: string,
) {
  if (!/^gid:\/\/shopify\/Menu\/\d+$/.test(menuId)) {
    throw new Error("Select a valid menu.");
  }

  const data = await graphqlRequest<{ menu: Menu | null }>(
    admin,
    GET_MENU_QUERY,
    { id: menuId },
  );
  const menu = data.menu;
  if (!menu) throw new Error("That menu is no longer available.");

  if (containsSitemapLink(menu.items)) {
    return { added: false, menuTitle: menu.title };
  }

  const items = [
    ...menu.items.map(toUpdateInput),
    {
      title: "Sitemap",
      type: "HTTP",
      url: `https://${shop}${SITEMAP_PATH}`,
    },
  ];
  const result = await graphqlRequest<{
    menuUpdate: {
      menu: { id: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(admin, UPDATE_MENU_MUTATION, {
    id: menu.id,
    title: menu.title,
    items,
  });

  if (result.menuUpdate.userErrors.length || !result.menuUpdate.menu) {
    throw new Error(
      result.menuUpdate.userErrors.map((error) => error.message).join("; ") ||
        "Shopify could not update this menu.",
    );
  }

  return { added: true, menuTitle: menu.title };
}

function toUpdateInput(item: MenuItem): Record<string, unknown> {
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    ...(item.url ? { url: item.url } : {}),
    ...(item.resourceId ? { resourceId: item.resourceId } : {}),
    ...(item.tags.length ? { tags: item.tags } : {}),
    items: item.items.map(toUpdateInput),
  };
}

function containsSitemapLink(items: MenuLink[]): boolean {
  return items.some((item) => {
    if (item.url) {
      try {
        if (
          new URL(item.url, "https://shop.myshopify.com").pathname.replace(
            /\/$/,
            "",
          ) === SITEMAP_PATH
        ) {
          return true;
        }
      } catch {
        // Invalid existing links should not prevent the merchant from adding a sitemap.
      }
    }
    return containsSitemapLink(item.items);
  });
}

function footerRank(menu: { handle: string; title: string }) {
  if (menu.handle === "footer") return 0;
  return /footer/i.test(`${menu.title} ${menu.handle}`) ? 1 : 2;
}

const LIST_MENUS_QUERY = `#graphql
  query SitemapMenus {
    menus(first: 100) {
      nodes {
        id
        title
        handle
        items {
          url
          items {
            url
            items { url }
          }
        }
      }
    }
  }
`;

const GET_MENU_QUERY = `#graphql
  query SitemapMenu($id: ID!) {
    menu(id: $id) {
      id
      title
      handle
      items {
        id title type url resourceId tags
        items {
          id title type url resourceId tags
          items { id title type url resourceId tags }
        }
      }
    }
  }
`;

const UPDATE_MENU_MUTATION = `#graphql
  mutation AddSitemapMenuLink($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
    menuUpdate(id: $id, title: $title, items: $items) {
      menu { id }
      userErrors { message }
    }
  }
`;
