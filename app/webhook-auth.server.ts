import "@shopify/shopify-api/adapters/web-api";
import {
  ApiVersion,
  shopifyApi,
  WebhookValidationErrorReason,
} from "@shopify/shopify-api";

let webhookApi: ReturnType<typeof shopifyApi> | undefined;

function getWebhookApi() {
  if (webhookApi) return webhookApi;

  const apiSecretKey = process.env.SHOPIFY_API_SECRET;
  if (!apiSecretKey) {
    throw new Error("SHOPIFY_API_SECRET is required to verify webhooks.");
  }

  const appUrl = new URL(process.env.SHOPIFY_APP_URL || "");
  webhookApi = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey,
    apiVersion: ApiVersion.April26,
    hostName: appUrl.host,
    hostScheme: appUrl.protocol.replace(":", "") as "http" | "https",
    isEmbeddedApp: true,
  });
  return webhookApi;
}

// Cleanup webhooks can arrive after Shopify revokes the offline token.
export async function authenticateCleanupWebhook(
  request: Request,
  allowedTopics: readonly string[],
) {
  if (request.method !== "POST") {
    throw new Response(null, { status: 405 });
  }

  const result = await getWebhookApi().webhooks.validate({
    rawBody: await request.text(),
    rawRequest: request,
  });
  if (!result.valid) {
    throw new Response(null, {
      status:
        result.reason === WebhookValidationErrorReason.InvalidHmac ? 401 : 400,
    });
  }
  if (!allowedTopics.includes(result.topic)) {
    throw new Response(null, { status: 400 });
  }

  return { shop: result.domain, topic: result.topic };
}
