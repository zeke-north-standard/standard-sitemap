import {
  Form,
  data,
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  getMarketingSubscription,
  subscribeToMarketing,
  unsubscribeFromMarketing,
} from "~/models/marketing-consent.server";
import { configFromFormData } from "~/models/sitemap.config";
import { findOrCreateSitemapPage } from "~/models/sitemap.page.server";
import { verifySitemapPublication } from "~/models/sitemap.publication.server";
import { renderSitemapDocument } from "~/models/sitemap.render";
import {
  getSitemapState,
  loadSnapshotForShop,
  markSitemapSyncFailed,
  saveSitemapConfig,
} from "~/models/sitemap.store.server";
import { syncSitemapForShop } from "~/models/sitemap.sync.server";
import {
  SITEMAP_SECTIONS,
  type SitemapSectionKey,
} from "~/models/sitemap.types";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [state, snapshot, marketingSubscription] = await Promise.all([
    getSitemapState(session.shop),
    loadSnapshotForShop(session.shop),
    getMarketingSubscription(session.shop),
  ]);
  const proxyUrl = `https://${session.shop}/apps/html-sitemap`;
  const themeEditorUrl = `https://${session.shop}/admin/themes/current/editor?template=page&addAppBlockId=${process.env.SHOPIFY_API_KEY}/html-sitemap`;

  return data({
    proxyUrl,
    themeEditorUrl,
    previewHtml: renderSitemapDocument(snapshot, session.shop),
    sectionCounts: Object.fromEntries(
      snapshot.sections.map((section) => [section.key, section.links.length]),
    ) as Record<SitemapSectionKey, number>,
    marketing: marketingSubscription
      ? {
          email: marketingSubscription.email,
          isSubscribed: marketingSubscription.status === "SUBSCRIBED",
          consentedAt: marketingSubscription.consentedAt.toISOString(),
        }
      : null,
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
  const proxyUrl = `https://${session.shop}/apps/html-sitemap`;

  try {
    if (intent === "save-config") {
      const config = configFromFormData(formData);
      await saveSitemapConfig(session.shop, config);
      const snapshot = await syncSitemapForShop({
        admin,
        shop: session.shop,
        config,
      });
      return data({
        message:
          snapshot.manifest.warnings.length > 0
            ? "Settings saved. The sitemap refreshed with a warning."
            : "Settings saved and the sitemap refreshed.",
      });
    }

    if (intent === "sync") {
      const state = await getSitemapState(session.shop);
      const snapshot = await syncSitemapForShop({
        admin,
        shop: session.shop,
        config: state.config,
      });
      return data({
        message:
          snapshot.manifest.warnings.length > 0
            ? `Generated ${snapshot.manifest.totalLinks.toLocaleString()} links with a warning.`
            : `Generated ${snapshot.manifest.totalLinks.toLocaleString()} sitemap links.`,
      });
    }

    if (intent === "verify-publication") {
      return data({
        verification: await verifySitemapPublication(proxyUrl),
      });
    }

    if (intent === "setup-page") {
      const page = await findOrCreateSitemapPage(admin, session.shop);
      return data({
        message: `The optional /pages/${page.handle} page is ready.`,
      });
    }

    if (intent === "subscribe-marketing") {
      if (formData.get("marketingConsent") !== "on") {
        return data(
          { error: "Confirm that you agree to receive email updates." },
          { status: 400 },
        );
      }

      await subscribeToMarketing(session.shop, formData.get("email"));
      return data({
        message: "You are subscribed to North Standard SEO updates.",
      });
    }

    if (intent === "unsubscribe-marketing") {
      await unsubscribeFromMarketing(session.shop);
      return data({
        message: "You have been unsubscribed from email updates.",
      });
    }

    return data({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    if (intent === "sync" || intent === "save-config") {
      await markSitemapSyncFailed(session.shop, error);
    }
    return data(
      {
        error: error instanceof Error ? error.message : "Something went wrong.",
      },
      { status: 500 },
    );
  }
};

export default function Index() {
  const {
    state,
    proxyUrl,
    themeEditorUrl,
    previewHtml,
    sectionCounts,
    marketing,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const shopify = useAppBridge();
  const [isRequestingPolicyAccess, setIsRequestingPolicyAccess] =
    useState(false);
  const [policyAccessMessage, setPolicyAccessMessage] = useState<string | null>(
    null,
  );
  const config = state.config;
  const activeIntent = navigation.formData?.get("intent");
  const isSubmittingIntent = (intent: string) =>
    navigation.state !== "idle" && activeIntent === intent;
  const successMessage =
    actionData && "message" in actionData ? actionData.message : null;
  const errorMessage =
    actionData && "error" in actionData ? actionData.error : null;
  const verification =
    actionData && "verification" in actionData ? actionData.verification : null;
  const hasSnapshot = state.totalLinks > 0;

  const requestPolicyAccess = async () => {
    setIsRequestingPolicyAccess(true);
    setPolicyAccessMessage(null);

    try {
      const response = await shopify.scopes.request(["read_legal_policies"]);
      if (response.result === "granted-all") {
        setIsRequestingPolicyAccess(false);
        submit({ intent: "sync" }, { method: "post" });
        return;
      }

      setPolicyAccessMessage(
        "Policy access was not granted. Policies will remain excluded from the sitemap.",
      );
    } catch {
      setPolicyAccessMessage(
        "Shopify could not open the permission prompt. Confirm that policy access is enabled for the current app version.",
      );
    } finally {
      setIsRequestingPolicyAccess(false);
    }
  };

  return (
    <s-page heading="Standard HTML Sitemap">
      <style>{DASHBOARD_STYLES}</style>
      <s-section>
        <s-stack gap="large">
          {successMessage ? (
            <s-banner tone="success">{successMessage}</s-banner>
          ) : null}
          {errorMessage ? (
            <s-banner tone="critical">{errorMessage}</s-banner>
          ) : null}

          <div className="sitemap-workflow-header">
            <img
              className="sitemap-app-mark"
              src="/standard-sitemap-app-icon.png"
              alt=""
              width="56"
              height="56"
            />
            <div>
              <s-heading>Generate your storefront sitemap</s-heading>
              <s-text>
                Scan the store, review the crawlable HTML, and publish it at a
                permanent Shopify storefront URL.
              </s-text>
            </div>
          </div>

          <div className="sitemap-dashboard-grid">
            <s-stack gap="large">
              <s-box>
                <s-stack gap="base">
                  <div className="sitemap-step-heading">
                    <span className="sitemap-step-number">1</span>
                    <div>
                      <s-heading>Generate</s-heading>
                      <s-text>
                        {hasSnapshot
                          ? `${state.totalLinks.toLocaleString()} links are ready.`
                          : "Run the first scan to build your sitemap."}
                      </s-text>
                    </div>
                  </div>

                  {hasSnapshot ? (
                    <div
                      className="sitemap-counts"
                      aria-label="Sitemap links by section"
                    >
                      {SITEMAP_SECTIONS.map((section) => (
                        <div className="sitemap-count" key={section}>
                          <span>{sectionLabel(section)}</span>
                          <strong>{sectionCounts[section] ?? 0}</strong>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <s-stack direction="inline" gap="base">
                    <Form method="post">
                      <input type="hidden" name="intent" value="sync" />
                      <s-button
                        variant="primary"
                        type="submit"
                        loading={isSubmittingIntent("sync") ? true : undefined}
                      >
                        {hasSnapshot ? "Refresh sitemap" : "Generate sitemap"}
                      </s-button>
                    </Form>
                    {state.lastSyncedAt ? (
                      <s-text>
                        Updated {new Date(state.lastSyncedAt).toLocaleString()}
                      </s-text>
                    ) : null}
                  </s-stack>

                  {state.truncated ? (
                    <s-banner tone="warning">
                      The sitemap reached the 5,000-link beta limit. Some links
                      were omitted.
                    </s-banner>
                  ) : null}
                  {state.lastSyncError && !errorMessage ? (
                    <s-banner tone="critical">{state.lastSyncError}</s-banner>
                  ) : null}
                  {state.manifest?.warnings?.map((warning) =>
                    warning.section === "policies" ? (
                      <s-banner key={warning.section} tone="warning">
                        <s-stack gap="small">
                          <s-text>{warning.message}</s-text>
                          <s-button
                            onClick={requestPolicyAccess}
                            loading={
                              isRequestingPolicyAccess ? true : undefined
                            }
                          >
                            Grant policy access
                          </s-button>
                          {policyAccessMessage ? (
                            <s-text>{policyAccessMessage}</s-text>
                          ) : null}
                        </s-stack>
                      </s-banner>
                    ) : (
                      <s-banner key={warning.section} tone="warning">
                        {warning.message}
                      </s-banner>
                    ),
                  )}
                </s-stack>
              </s-box>

              <s-divider />

              <s-box>
                <s-stack gap="base">
                  <div className="sitemap-step-heading">
                    <span className="sitemap-step-number">2</span>
                    <div>
                      <s-heading>Preview</s-heading>
                      <s-text>
                        This is the server-rendered HTML search engines and
                        shoppers receive.
                      </s-text>
                    </div>
                  </div>
                  {hasSnapshot ? (
                    <iframe
                      className="sitemap-preview"
                      title="Generated sitemap preview"
                      srcDoc={previewHtml}
                      sandbox=""
                    />
                  ) : (
                    <div className="sitemap-empty-preview">
                      Generate the sitemap to see a preview here.
                    </div>
                  )}
                </s-stack>
              </s-box>

              {hasSnapshot ? (
                <>
                  <s-divider />
                  <s-box>
                    <s-stack gap="base">
                      <s-heading>SEO updates</s-heading>
                      {marketing?.isSubscribed ? (
                        <>
                          <s-banner tone="success">
                            Updates are going to {marketing.email}.
                          </s-banner>
                          <s-text>
                            Occasional practical SEO guidance and news about new
                            North Standard tools.
                          </s-text>
                          <Form method="post">
                            <input
                              type="hidden"
                              name="intent"
                              value="unsubscribe-marketing"
                            />
                            <s-button
                              type="submit"
                              loading={
                                isSubmittingIntent("unsubscribe-marketing")
                                  ? true
                                  : undefined
                              }
                            >
                              Unsubscribe
                            </s-button>
                          </Form>
                        </>
                      ) : (
                        <Form method="post">
                          <s-stack gap="base">
                            <input
                              type="hidden"
                              name="intent"
                              value="subscribe-marketing"
                            />
                            <s-text>
                              Get occasional practical SEO guidance and news
                              about new North Standard tools.
                            </s-text>
                            <s-email-field
                              label="Business email"
                              name="email"
                              value={marketing?.email ?? ""}
                              autocomplete="email"
                            />
                            <s-checkbox
                              name="marketingConsent"
                              value="on"
                              label="I agree to receive marketing emails from North Standard."
                            />
                            <s-button
                              type="submit"
                              loading={
                                isSubmittingIntent("subscribe-marketing")
                                  ? true
                                  : undefined
                              }
                            >
                              Subscribe
                            </s-button>
                            <s-text>
                              Unsubscribe anytime. Read our{" "}
                              <a
                                href="/privacy"
                                target="_blank"
                                rel="noreferrer"
                              >
                                Privacy Policy
                              </a>
                              .
                            </s-text>
                          </s-stack>
                        </Form>
                      )}
                    </s-stack>
                  </s-box>
                </>
              ) : null}
            </s-stack>

            <s-stack gap="large">
              <s-box>
                <s-stack gap="base">
                  <div className="sitemap-step-heading">
                    <span className="sitemap-step-number">3</span>
                    <div>
                      <s-heading>Publish</s-heading>
                      <s-text>
                        Your recommended sitemap URL is permanent.
                      </s-text>
                    </div>
                  </div>
                  <div className="sitemap-url">{proxyUrl}</div>
                  <s-button
                    href={proxyUrl}
                    target="_blank"
                    variant="primary"
                    disabled={!hasSnapshot ? true : undefined}
                  >
                    Open live sitemap
                  </s-button>
                  <Form method="post">
                    <input
                      type="hidden"
                      name="intent"
                      value="verify-publication"
                    />
                    <s-button
                      type="submit"
                      loading={
                        isSubmittingIntent("verify-publication")
                          ? true
                          : undefined
                      }
                      disabled={!hasSnapshot ? true : undefined}
                    >
                      Check publication
                    </s-button>
                  </Form>
                  {verification ? (
                    <s-banner tone={verification.tone}>
                      {verification.message}
                    </s-banner>
                  ) : null}
                </s-stack>
              </s-box>

              <s-divider />

              <s-box>
                <s-stack gap="base">
                  <s-heading>Optional theme page</s-heading>
                  <s-text>
                    Use this only when you want the sitemap inside a themed
                    Shopify page. The app proxy above is already the complete
                    SEO-ready version.
                  </s-text>
                  {state.sitemapPageHandle ? (
                    <s-banner tone="success">
                      Page /pages/{state.sitemapPageHandle} is ready.
                    </s-banner>
                  ) : null}
                  <Form method="post">
                    <input type="hidden" name="intent" value="setup-page" />
                    <s-button
                      type="submit"
                      loading={
                        isSubmittingIntent("setup-page") ? true : undefined
                      }
                    >
                      Create or detect page
                    </s-button>
                  </Form>
                  <s-button href={themeEditorUrl} target="_blank">
                    Open theme editor
                  </s-button>
                  <s-banner tone="warning">
                    Add the app block to a dedicated sitemap page template. A
                    shared template would show it on every page using that
                    template.
                  </s-banner>
                </s-stack>
              </s-box>
            </s-stack>
          </div>
        </s-stack>
      </s-section>

      <s-section heading="Customize appearance">
        <Form method="post">
          <s-stack gap="base">
            <input type="hidden" name="intent" value="save-config" />
            <s-text>
              These settings apply to the app proxy and the next synchronized
              theme-block snapshot.
            </s-text>
            <s-grid
              gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))"
              gap="base"
            >
              <s-select
                label="Layout preset"
                name="layout"
                value={config.layout}
              >
                <s-option value="compact">Compact</s-option>
                <s-option value="directory">Directory</s-option>
                <s-option value="editorial">Editorial</s-option>
              </s-select>
              <s-select
                label="Columns"
                name="columns"
                value={String(config.columns)}
              >
                <s-option value="1">1</s-option>
                <s-option value="2">2</s-option>
                <s-option value="3">3</s-option>
                <s-option value="4">4</s-option>
              </s-select>
              <s-text-field
                label="Accent color"
                name="accentColor"
                value={config.accentColor}
              />
              <s-text-field
                label="Text color"
                name="textColor"
                value={config.textColor}
              />
              <s-select
                label="Background"
                name="backgroundMode"
                value={config.backgroundMode}
              >
                <s-option value="transparent">Transparent</s-option>
                <s-option value="soft">Soft</s-option>
                <s-option value="contrast">Contrast</s-option>
              </s-select>
              <s-select
                label="Heading size"
                name="headingSize"
                value={config.headingSize}
              >
                <s-option value="small">Small</s-option>
                <s-option value="medium">Medium</s-option>
                <s-option value="large">Large</s-option>
              </s-select>
              <s-select
                label="Spacing"
                name="spacingDensity"
                value={config.spacingDensity}
              >
                <s-option value="tight">Tight</s-option>
                <s-option value="balanced">Balanced</s-option>
                <s-option value="roomy">Roomy</s-option>
              </s-select>
            </s-grid>
            <s-stack direction="inline" gap="large">
              <s-checkbox
                label="Show counts"
                name="showCounts"
                checked={config.showCounts ? true : undefined}
              />
              <s-checkbox
                label="Show last updated dates"
                name="showLastUpdated"
                checked={config.showLastUpdated ? true : undefined}
              />
            </s-stack>
            <s-divider />
            <s-heading>Included sections</s-heading>
            <s-grid
              gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))"
              gap="small"
            >
              {SITEMAP_SECTIONS.map((section) => (
                <s-checkbox
                  key={section}
                  label={sectionLabel(section)}
                  name={`enabled:${section}`}
                  checked={
                    config.enabledSections.includes(section) ? true : undefined
                  }
                />
              ))}
            </s-grid>
            <s-button
              variant="primary"
              type="submit"
              loading={isSubmittingIntent("save-config") ? true : undefined}
            >
              Save and refresh sitemap
            </s-button>
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}

function sectionLabel(section: string) {
  return section.charAt(0).toUpperCase() + section.slice(1);
}

const DASHBOARD_STYLES = `
  .sitemap-workflow-header {
    align-items: center;
    display: flex;
    gap: 16px;
  }
  .sitemap-app-mark {
    border: 1px solid #d8d4c8;
    border-radius: 6px;
    display: block;
    flex: 0 0 auto;
    object-fit: cover;
  }
  .sitemap-dashboard-grid {
    display: grid;
    gap: 32px;
    grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
  }
  .sitemap-step-heading {
    align-items: flex-start;
    display: flex;
    gap: 12px;
  }
  .sitemap-step-number {
    align-items: center;
    background: #202223;
    border-radius: 50%;
    color: #fff;
    display: inline-flex;
    flex: 0 0 28px;
    font-size: 14px;
    font-weight: 700;
    height: 28px;
    justify-content: center;
    width: 28px;
  }
  .sitemap-counts {
    border-bottom: 1px solid #dedede;
    border-top: 1px solid #dedede;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .sitemap-count {
    display: flex;
    justify-content: space-between;
    min-width: 0;
    padding: 10px 12px;
  }
  .sitemap-count span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sitemap-preview {
    background: #fff;
    border: 1px solid #c9cccf;
    border-radius: 6px;
    height: 480px;
    width: 100%;
  }
  .sitemap-empty-preview {
    align-items: center;
    background: #f6f6f7;
    border: 1px dashed #babfc3;
    color: #6d7175;
    display: flex;
    height: 220px;
    justify-content: center;
    padding: 24px;
    text-align: center;
  }
  .sitemap-url {
    background: #f6f6f7;
    border: 1px solid #d2d5d8;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 12px;
    overflow-wrap: anywhere;
    padding: 10px;
  }
  @media (max-width: 860px) {
    .sitemap-dashboard-grid { grid-template-columns: 1fr; }
    .sitemap-counts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
`;
