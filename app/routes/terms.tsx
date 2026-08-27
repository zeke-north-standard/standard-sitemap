import type { MetaFunction } from "react-router";
import { LegalPage } from "~/components/legal-page";

export const meta: MetaFunction = () => [
  { title: "Terms of Service | Standard HTML Sitemap" },
  {
    name: "description",
    content: "Terms for using the Standard HTML Sitemap Shopify app.",
  },
];

export default function TermsOfService() {
  return (
    <LegalPage title="Terms of Service" effectiveDate="August 26, 2026">
      <p>
        These terms govern use of Standard HTML Sitemap, provided by North
        Standard Marketing. By installing or using the app, the merchant agrees
        to these terms.
      </p>

      <h2>The service</h2>
      <p>
        The app generates a human-readable HTML sitemap from eligible published
        Shopify resources. It supplements Shopify&apos;s XML sitemap and does
        not guarantee search rankings, indexing, traffic, or sales.
      </p>

      <h2>Free beta</h2>
      <p>
        The current service is offered as a free beta. Features, limits, and
        availability may change as the product develops. We will provide notice
        before charging for functionality that was previously free where
        required by law or Shopify policy.
      </p>

      <h2>Merchant responsibilities</h2>
      <p>
        Merchants are responsible for their Shopify store, published content,
        theme changes, legal compliance, and review of generated sitemap output.
        The app must not be used in a way that violates law, Shopify&apos;s
        terms, or the rights of others.
      </p>

      <h2>Availability and warranty</h2>
      <p>
        We work to keep the app reliable, but beta software may contain errors
        or experience interruptions. To the extent permitted by law, the service
        is provided as available without warranties of uninterrupted operation
        or fitness for a particular purpose.
      </p>

      <h2>Termination</h2>
      <p>
        Merchants may stop using the service by uninstalling the app. We may
        suspend use that threatens the service, violates these terms, or creates
        legal or security risk.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms can be sent to{" "}
        <a href="mailto:ezekiel@northstandard.co">ezekiel@northstandard.co</a>.
        See our <a href="/privacy">Privacy Policy</a> for information about data
        practices.
      </p>
    </LegalPage>
  );
}
