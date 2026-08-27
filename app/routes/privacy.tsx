import type { MetaFunction } from "react-router";
import { LegalPage } from "~/components/legal-page";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy | Standard HTML Sitemap" },
  {
    name: "description",
    content: "Privacy practices for the Standard HTML Sitemap Shopify app.",
  },
];

export default function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy Policy" effectiveDate="August 26, 2026">
      <p>
        North Standard Marketing operates Standard HTML Sitemap, a Shopify app
        that creates a human-readable sitemap for a merchant&apos;s storefront.
        This policy explains the information the app processes and the choices
        available to merchants.
      </p>

      <h2>Information we process</h2>
      <ul>
        <li>
          Shopify account and store information needed to install, authenticate,
          and operate the app, including the shop domain and app session data.
        </li>
        <li>
          Published storefront catalog and content used to generate the sitemap,
          plus sitemap settings, generated snapshots, and sync status.
        </li>
        <li>
          A business email address, consent timestamp, and consent status only
          when a merchant explicitly subscribes to North Standard emails.
        </li>
      </ul>
      <p>
        The app does not intentionally collect or store shopper or customer
        personal information. Shopify may still send mandatory privacy webhooks,
        which the app acknowledges and processes as required.
      </p>

      <h2>How we use information</h2>
      <p>
        We use store information to provide, secure, maintain, and improve the
        sitemap service. We use an opted-in business email only for occasional
        SEO guidance, product updates, and information about North Standard
        tools. Installing the app does not subscribe a merchant to marketing.
      </p>

      <h2>Service providers</h2>
      <p>
        We use Shopify to connect the app to stores, Vercel to host the service,
        and a managed PostgreSQL provider to store app data. These providers
        process information only as needed to deliver their services to us.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        Operational app data is retained while the app is installed and is
        deleted following uninstall and Shopify&apos;s shop-redaction request.
        Merchants can withdraw marketing consent in the app at any time. We may
        retain limited records when required to comply with law, resolve
        disputes, or enforce agreements.
      </p>

      <h2>Your choices</h2>
      <p>
        Merchants can decline email marketing without losing any sitemap
        functionality, unsubscribe in the app, uninstall the app, or contact us
        to ask about access, correction, or deletion of their information.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or privacy requests can be sent to{" "}
        <a href="mailto:ezekiel@northstandard.co">ezekiel@northstandard.co</a>.
      </p>
    </LegalPage>
  );
}
