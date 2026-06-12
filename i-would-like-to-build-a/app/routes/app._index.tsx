import {
  Form,
  data,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { configFromFormData } from "~/models/sitemap.config";
import { findOrCreateSitemapPage } from "~/models/sitemap.page.server";
import { syncSitemapForShop } from "~/models/sitemap.sync.server";
import {
  getSitemapState,
  markSitemapSyncFailed,
  saveSitemapConfig,
} from "~/models/sitemap.store.server";
import { SITEMAP_SECTIONS } from "~/models/sitemap.types";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const state = await getSitemapState(session.shop);
  const appUrl = new URL(request.url);
  const proxyUrl = `https://${session.shop}/apps/html-sitemap`;
  const themeEditorUrl = `https://${session.shop}/admin/themes/current/editor?template=page&addAppBlockId=${process.env.SHOPIFY_API_KEY}/html-sitemap`;

  return data({
    shop: session.shop,
    proxyUrl,
    themeEditorUrl,
    appHost: appUrl.host,
    state: {
      config: state.config,
      manifest: state.manifest,
      lastSyncStatus: state.lastSyncStatus,
      lastSyncError: state.lastSyncError,
      lastSyncedAt: state.lastSyncedAt?.toISOString() ?? null,
      totalLinks: state.totalLinks,
      truncated: state.truncated,
      sitemapPageHandle: state.sitemapPageHandle,
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  try {
    if (intent === "save-config") {
      const config = configFromFormData(formData);
      await saveSitemapConfig(session.shop, config);
      await syncSitemapForShop({ admin, shop: session.shop, config });
      return data({ message: "Style settings saved and sitemap refreshed." });
    }

    if (intent === "sync") {
      const state = await getSitemapState(session.shop);
      await syncSitemapForShop({
        admin,
        shop: session.shop,
        config: state.config,
      });
      return data({ message: "Sitemap synced successfully." });
    }

    if (intent === "setup-page") {
      await findOrCreateSitemapPage(admin, session.shop);
      return data({ message: "Sitemap page is ready." });
    }

    return data({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    await markSitemapSyncFailed(session.shop, error);
    return data(
      {
        error: error instanceof Error ? error.message : "Something went wrong.",
      },
      { status: 500 },
    );
  }
};

export default function Index() {
  const { state, proxyUrl, themeEditorUrl } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";
  const config = state.config;

  return (
    <s-page heading="Dynamic HTML Sitemap">
      <s-section>
        <s-grid gridTemplateColumns="2fr 1fr" gap="base">
          <s-stack gap="base">
            {actionData?.message ? (
              <s-banner tone="success">{actionData.message}</s-banner>
            ) : null}
            {actionData?.error ? (
              <s-banner tone="critical">{actionData.error}</s-banner>
            ) : null}

            <s-card>
              <s-stack gap="base">
                <s-heading>Storefront sitemap</s-heading>
                <s-text>
                  Publish a crawlable HTML sitemap at the app proxy URL, or add
                  the app block to a dedicated page template in the theme editor.
                </s-text>
                <s-inline gap="base">
                  <s-button href={proxyUrl} target="_blank">
                    Open sitemap
                  </s-button>
                  <s-button href={themeEditorUrl} target="_blank" variant="secondary">
                    Open theme editor
                  </s-button>
                </s-inline>
                <s-banner tone="warning">
                  Add the theme block only to a dedicated sitemap page template.
                  Adding it to the default page template can show the sitemap on
                  every normal page that uses that template.
                </s-banner>
              </s-stack>
            </s-card>

            <s-card>
              <Form method="post">
                <s-stack gap="base">
                  <input type="hidden" name="intent" value="save-config" />
                  <s-heading>Style and sections</s-heading>
                  <s-grid gridTemplateColumns="repeat(2, minmax(0, 1fr))" gap="base">
                    <s-select
                      label="Layout preset"
                      name="layout"
                      defaultValue={config.layout}
                    >
                      <s-option value="compact">Compact</s-option>
                      <s-option value="directory">Directory</s-option>
                      <s-option value="editorial">Editorial</s-option>
                    </s-select>
                    <s-select
                      label="Columns"
                      name="columns"
                      defaultValue={String(config.columns)}
                    >
                      <s-option value="1">1</s-option>
                      <s-option value="2">2</s-option>
                      <s-option value="3">3</s-option>
                      <s-option value="4">4</s-option>
                    </s-select>
                    <s-text-field
                      label="Accent color"
                      name="accentColor"
                      defaultValue={config.accentColor}
                    />
                    <s-text-field
                      label="Text color"
                      name="textColor"
                      defaultValue={config.textColor}
                    />
                    <s-select
                      label="Background"
                      name="backgroundMode"
                      defaultValue={config.backgroundMode}
                    >
                      <s-option value="transparent">Transparent</s-option>
                      <s-option value="soft">Soft</s-option>
                      <s-option value="contrast">Contrast</s-option>
                    </s-select>
                    <s-select
                      label="Heading size"
                      name="headingSize"
                      defaultValue={config.headingSize}
                    >
                      <s-option value="small">Small</s-option>
                      <s-option value="medium">Medium</s-option>
                      <s-option value="large">Large</s-option>
                    </s-select>
                    <s-select
                      label="Spacing"
                      name="spacingDensity"
                      defaultValue={config.spacingDensity}
                    >
                      <s-option value="tight">Tight</s-option>
                      <s-option value="balanced">Balanced</s-option>
                      <s-option value="roomy">Roomy</s-option>
                    </s-select>
                  </s-grid>
                  <s-checkbox
                    name="showCounts"
                    defaultChecked={config.showCounts}
                  >
                    Show counts
                  </s-checkbox>
                  <s-checkbox
                    name="showLastUpdated"
                    defaultChecked={config.showLastUpdated}
                  >
                    Show last updated dates
                  </s-checkbox>
                  <s-divider />
                  <s-heading>Included sections</s-heading>
                  <s-stack gap="small">
                    {SITEMAP_SECTIONS.map((section) => (
                      <s-checkbox
                        key={section}
                        name={`enabled:${section}`}
                        defaultChecked={config.enabledSections.includes(section)}
                      >
                        {sectionLabel(section)}
                      </s-checkbox>
                    ))}
                  </s-stack>
                  <s-button variant="primary" type="submit" loading={isSubmitting}>
                    Save settings
                  </s-button>
                </s-stack>
              </Form>
            </s-card>
          </s-stack>

          <s-stack gap="base">
            <s-card>
              <s-stack gap="base">
                <s-heading>Sync status</s-heading>
                <s-text>Status: {state.lastSyncStatus}</s-text>
                <s-text>Links: {state.totalLinks}</s-text>
                <s-text>
                  Last sync:{" "}
                  {state.lastSyncedAt
                    ? new Date(state.lastSyncedAt).toLocaleString()
                    : "Not synced yet"}
                </s-text>
                {state.truncated ? (
                  <s-banner tone="warning">
                    This sitemap reached the 5,000 link v1 limit. The generated
                    sitemap remains valid, but some links were omitted.
                  </s-banner>
                ) : null}
                {state.lastSyncError ? (
                  <s-banner tone="critical">{state.lastSyncError}</s-banner>
                ) : null}
                <Form method="post">
                  <input type="hidden" name="intent" value="sync" />
                  <s-button type="submit" loading={isSubmitting}>
                    Sync now
                  </s-button>
                </Form>
              </s-stack>
            </s-card>

            <s-card>
              <s-stack gap="base">
                <s-heading>Guided page setup</s-heading>
                <s-text>
                  Create or detect a Shopify page with the handle
                  <code> sitemap</code>. Use a dedicated page template before
                  adding the theme app block.
                </s-text>
                {state.sitemapPageHandle ? (
                  <s-text>Page handle: {state.sitemapPageHandle}</s-text>
                ) : null}
                <Form method="post">
                  <input type="hidden" name="intent" value="setup-page" />
                  <s-button type="submit" loading={isSubmitting}>
                    Create or detect page
                  </s-button>
                </Form>
              </s-stack>
            </s-card>
          </s-stack>
        </s-grid>
      </s-section>
    </s-page>
  );
}

function sectionLabel(section: string) {
  return section.charAt(0).toUpperCase() + section.slice(1);
}
