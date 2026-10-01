import type { MetaFunction } from "react-router";
import { LegalPage } from "~/components/legal-page";

export const meta: MetaFunction = () => [
  { title: "Support | Standard HTML Sitemap" },
  {
    name: "description",
    content: "Setup and support for the Standard HTML Sitemap Shopify app.",
  },
];

export default function Support() {
  return (
    <LegalPage title="Support" effectiveDate="">
      <p>
        Standard HTML Sitemap creates a human-readable sitemap for stores using
        Shopify&apos;s Online Store sales channel. For help, email{" "}
        <a href="mailto:ezekiel@northstandard.co">ezekiel@northstandard.co</a>.
      </p>

      <h2>Get started</h2>
      <ol>
        <li>Open Standard HTML Sitemap from Apps in Shopify admin.</li>
        <li>Select Generate sitemap, then review the preview.</li>
        <li>
          Select Open live sitemap to view the published page at
          /apps/html-sitemap on your storefront.
        </li>
      </ol>

      <h2>Add a footer link</h2>
      <p>
        In the app, choose the menu your theme uses in its footer and select
        Add Sitemap link. If your theme uses a different menu, use the manual
        link instructions shown in the app. Check your storefront footer after
        saving because themes can display different menus.
      </p>

      <h2>Keep the sitemap current</h2>
      <p>
        Product and collection changes trigger a refresh. After changing
        pages, articles, policies, or navigation, select Refresh sitemap in the
        app. The app currently includes up to 5,000 links and shows a warning
        when the generated sitemap is truncated.
      </p>

      <h2>Troubleshooting</h2>
      <p>
        If the sitemap is not visible, select Check publication in the app and
        confirm that your Online Store is available to visitors. A storefront
        password can prevent visitors and crawlers from viewing the page. If a
        section is missing, check that it is enabled in Customize appearance,
        then refresh the sitemap. Policies also require a separate permission
        grant inside the app.
      </p>

      <h2>Account and privacy</h2>
      <p>
        The app is free to use. Marketing email is optional and can be turned
        off in the app or from an email&apos;s unsubscribe link. See the{" "}
        <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms</a>.
      </p>
    </LegalPage>
  );
}
