import { graphqlRequest, type GraphqlClient } from "./shopify-graphql.server";
import { saveSitemapPage } from "./sitemap.store.server";

export async function findOrCreateSitemapPage(
  admin: GraphqlClient,
  shop: string,
) {
  const existing = await graphqlRequest<{
    pages: {
      nodes: Array<{
        id: string;
        handle: string;
        title: string;
      }>;
    };
  }>(admin, FIND_SITEMAP_PAGE_QUERY);

  const page = existing.pages.nodes[0] ?? (await createSitemapPage(admin));
  await saveSitemapPage(shop, { id: page.id, handle: page.handle });
  return page;
}

async function createSitemapPage(admin: GraphqlClient) {
  const data = await graphqlRequest<{
    pageCreate: {
      page: {
        id: string;
        handle: string;
        title: string;
      } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(admin, CREATE_SITEMAP_PAGE_MUTATION);

  if (data.pageCreate.userErrors.length > 0 || !data.pageCreate.page) {
    throw new Error(
      data.pageCreate.userErrors.map((error) => error.message).join("; ") ||
        "Shopify did not create the Sitemap page.",
    );
  }

  return data.pageCreate.page;
}

const FIND_SITEMAP_PAGE_QUERY = `#graphql
  query FindSitemapPage {
    pages(first: 1, query: "handle:sitemap") {
      nodes {
        id
        title
        handle
      }
    }
  }
`;

const CREATE_SITEMAP_PAGE_MUTATION = `#graphql
  mutation CreateSitemapPage {
    pageCreate(page: {
      title: "Sitemap",
      handle: "sitemap",
      body: "<p>Add the Dynamic HTML Sitemap app block to a dedicated page template, or use the app proxy URL at /apps/html-sitemap.</p>",
      isPublished: true
    }) {
      page {
        id
        title
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;
