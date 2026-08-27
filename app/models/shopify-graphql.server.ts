export interface GraphqlClient {
  graphql(
    query: string,
    options?: { variables?: Record<string, unknown> },
  ): Promise<Response>;
}

export async function graphqlRequest<T>(
  client: GraphqlClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await client.graphql(query, { variables });
  const json = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(json.errors.map((error) => error.message).join("; "));
  }

  if (!json.data) {
    throw new Error("Shopify returned no GraphQL data.");
  }

  return json.data;
}

export function publicPathFromOnlineStoreUrl(
  onlineStoreUrl: string | null | undefined,
  fallback: string,
) {
  if (!onlineStoreUrl) return fallback;

  try {
    const url = new URL(onlineStoreUrl);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return onlineStoreUrl.startsWith("/") ? onlineStoreUrl : fallback;
  }
}
