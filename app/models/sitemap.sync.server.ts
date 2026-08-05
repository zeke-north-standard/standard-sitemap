import { DEFAULT_SITEMAP_CONFIG } from "./sitemap.config";
import { buildChunkedSitemap } from "./sitemap.chunking";
import {
  graphqlRequest,
  publicPathFromOnlineStoreUrl,
  type GraphqlClient,
} from "./shopify-graphql.server";
import { saveSitemapSnapshot } from "./sitemap.store.server";
import type {
  SitemapConfig,
  SitemapLink,
  SitemapSectionKey,
} from "./sitemap.types";

interface SyncInput {
  admin: GraphqlClient;
  shop: string;
  config?: SitemapConfig;
}

interface AppInstallationData {
  currentAppInstallation: {
    id: string;
  };
}

export async function syncSitemapForShop({
  admin,
  shop,
  config = DEFAULT_SITEMAP_CONFIG,
}: SyncInput) {
  const [navigation, collections, products, pages, articles, policyResult] =
    await Promise.all([
      fetchNavigation(admin),
      fetchCollections(admin),
      fetchProducts(admin),
      fetchPages(admin),
      fetchArticles(admin),
      fetchPoliciesWithWarning(admin),
    ]);

  const chunked = buildChunkedSitemap({
    config,
    locale: "primary",
    sections: [
      { key: "navigation", links: navigation },
      { key: "collections", links: collections },
      { key: "products", links: products },
      { key: "pages", links: pages },
      { key: "articles", links: articles },
      { key: "policies", links: policyResult.links },
    ],
  });
  chunked.snapshot.manifest.warnings = policyResult.warning
    ? [policyResult.warning]
    : [];

  await saveSitemapSnapshot(shop, chunked.snapshot, chunked.chunks);
  await writeAppDataMetafields(admin, chunked.snapshot, chunked.chunks);

  return chunked.snapshot;
}

async function fetchProducts(admin: GraphqlClient) {
  return fetchConnection<ProductNode>(admin, PRODUCTS_QUERY, "products").then(
    (nodes) =>
      nodes.map((node) => ({
        title: node.title,
        handle: node.handle,
        url: publicPathFromOnlineStoreUrl(
          node.onlineStoreUrl,
          `/products/${node.handle}`,
        ),
        updatedAt: node.updatedAt,
      })),
  );
}

async function fetchCollections(admin: GraphqlClient) {
  return fetchConnection<CollectionNode>(
    admin,
    COLLECTIONS_QUERY,
    "collections",
  ).then((nodes) =>
    nodes.map((node) => ({
      title: node.title,
      handle: node.handle,
      url: `/collections/${node.handle}`,
      updatedAt: node.updatedAt,
    })),
  );
}

async function fetchPages(admin: GraphqlClient) {
  return fetchConnection<PageNode>(admin, PAGES_QUERY, "pages").then((nodes) =>
    nodes.map((node) => ({
      title: node.title,
      handle: node.handle,
      url: `/pages/${node.handle}`,
      updatedAt: node.updatedAt,
    })),
  );
}

async function fetchArticles(admin: GraphqlClient) {
  return fetchConnection<ArticleNode>(admin, ARTICLES_QUERY, "articles").then(
    (nodes) =>
      nodes.map((node) => ({
        title: node.title,
        handle: node.handle,
        url: `/blogs/${node.blog.handle}/${node.handle}`,
        updatedAt: node.updatedAt,
      })),
  );
}

async function fetchNavigation(admin: GraphqlClient) {
  const data = await graphqlRequest<{
    menus: {
      nodes: Array<{
        handle: string;
        isDefault: boolean;
        items: NavigationItem[];
      }>;
    };
  }>(admin, NAVIGATION_QUERY);
  const menu =
    data.menus.nodes.find((candidate) => candidate.handle === "main-menu") ??
    data.menus.nodes.find((candidate) => candidate.isDefault) ??
    data.menus.nodes[0];

  return flattenNavigationItems(menu?.items ?? []);
}

async function fetchPolicies(admin: GraphqlClient) {
  const data = await graphqlRequest<{
    shop: {
      shopPolicies: Array<{
        title: string;
        url: string;
        updatedAt: string;
      }>;
    };
  }>(admin, POLICIES_QUERY);

  return data.shop.shopPolicies.map((policy) => ({
    title: policy.title,
    url: publicPathFromOnlineStoreUrl(policy.url, policy.url),
    updatedAt: policy.updatedAt,
  }));
}

async function fetchPoliciesWithWarning(admin: GraphqlClient) {
  try {
    return {
      links: await fetchPolicies(admin),
      warning: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isPolicyPermissionError(message)) throw error;

    return {
      links: [],
      warning: {
        section: "policies" as const,
        message:
          "Policies were skipped because the app has not been granted legal policy access yet.",
      },
    };
  }
}

function isPolicyPermissionError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("read_legal_policies") ||
    normalized.includes("access denied") ||
    normalized.includes("does not have access")
  );
}

async function fetchConnection<T extends { title: string }>(
  admin: GraphqlClient,
  query: string,
  field: string,
) {
  const nodes: T[] = [];
  let after: string | null = null;

  do {
    const data: Record<string, Connection<T>> = await graphqlRequest<
      Record<string, Connection<T>>
    >(admin, query, { first: 250, after });
    const connection: Connection<T> = data[field];
    nodes.push(...connection.nodes);
    after = connection.pageInfo.hasNextPage
      ? connection.pageInfo.endCursor
      : null;
  } while (after && nodes.length < 5000);

  return nodes;
}

async function writeAppDataMetafields(
  admin: GraphqlClient,
  snapshot: {
    config: SitemapConfig;
    manifest: unknown;
  },
  chunks: Array<{
    section: SitemapSectionKey;
    chunkIndex: number;
    links: SitemapLink[];
  }>,
) {
  const appInstallation = await graphqlRequest<AppInstallationData>(
    admin,
    CURRENT_APP_INSTALLATION_QUERY,
  );

  const metafields = [
    {
      namespace: "html_sitemap",
      key: "config",
      type: "json",
      value: JSON.stringify(snapshot.config),
      ownerId: appInstallation.currentAppInstallation.id,
    },
    {
      namespace: "html_sitemap",
      key: "manifest",
      type: "json",
      value: JSON.stringify(snapshot.manifest),
      ownerId: appInstallation.currentAppInstallation.id,
    },
    ...chunks.map((chunk) => ({
      namespace: "html_sitemap",
      key: `${chunk.section}_${chunk.chunkIndex}`,
      type: "json",
      value: JSON.stringify(chunk.links),
      ownerId: appInstallation.currentAppInstallation.id,
    })),
  ];

  for (let index = 0; index < metafields.length; index += 25) {
    const result = await graphqlRequest<{
      metafieldsSet: {
        userErrors: Array<{ message: string }>;
      };
    }>(admin, METAFIELDS_SET_MUTATION, {
      metafields: metafields.slice(index, index + 25),
    });
    if (result.metafieldsSet.userErrors.length > 0) {
      throw new Error(
        result.metafieldsSet.userErrors
          .map((error) => error.message)
          .join("; "),
      );
    }
  }
}

function flattenNavigationItems(items: NavigationItem[]): SitemapLink[] {
  return items.flatMap((item) => [
    ...(item.url
      ? [
          {
            title: item.title,
            url: item.url,
            handle: null,
            updatedAt: null,
          },
        ]
      : []),
    ...flattenNavigationItems(item.items ?? []),
  ]);
}

interface Connection<T> {
  nodes: T[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
}

interface ProductNode {
  title: string;
  handle: string;
  onlineStoreUrl: string | null;
  updatedAt: string;
}

interface CollectionNode {
  title: string;
  handle: string;
  updatedAt: string | null;
}

interface PageNode extends CollectionNode {}

interface ArticleNode extends CollectionNode {
  blog: {
    handle: string;
  };
}

interface NavigationItem {
  title: string;
  url: string | null;
  items?: NavigationItem[];
}

const CONNECTION_FIELDS = `
  pageInfo {
    hasNextPage
    endCursor
  }
`;

const CURRENT_APP_INSTALLATION_QUERY = `#graphql
  query CurrentAppInstallation {
    currentAppInstallation {
      id
    }
  }
`;

const PRODUCTS_QUERY = `#graphql
  query SitemapProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, query: "status:active AND published_status:published") {
      nodes {
        title
        handle
        onlineStoreUrl
        updatedAt
      }
      ${CONNECTION_FIELDS}
    }
  }
`;

const COLLECTIONS_QUERY = `#graphql
  query SitemapCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after, query: "published_status:published") {
      nodes {
        title
        handle
        updatedAt
      }
      ${CONNECTION_FIELDS}
    }
  }
`;

const PAGES_QUERY = `#graphql
  query SitemapPages($first: Int!, $after: String) {
    pages(first: $first, after: $after, query: "published_status:published") {
      nodes {
        title
        handle
        updatedAt
      }
      ${CONNECTION_FIELDS}
    }
  }
`;

const ARTICLES_QUERY = `#graphql
  query SitemapArticles($first: Int!, $after: String) {
    articles(first: $first, after: $after, query: "published_status:published") {
      nodes {
        title
        handle
        updatedAt
        blog {
          handle
        }
      }
      ${CONNECTION_FIELDS}
    }
  }
`;

const NAVIGATION_QUERY = `#graphql
  query SitemapNavigation {
    menus(first: 50) {
      nodes {
        handle
        isDefault
        items {
          title
          url
          items {
            title
            url
            items {
              title
              url
            }
          }
        }
      }
    }
  }
`;

const POLICIES_QUERY = `#graphql
  query SitemapPolicies {
    shop {
      shopPolicies {
        title
        url
        updatedAt
      }
    }
  }
`;

const METAFIELDS_SET_MUTATION = `#graphql
  mutation SetSitemapMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
      }
      userErrors {
        field
        message
      }
    }
  }
`;
