import type { LoaderFunctionArgs } from "react-router";
import { login } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const result = await login(request);
  return result instanceof Response ? result : null;
};

export default function Login() {
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        margin: "64px auto",
        maxWidth: 560,
        padding: "0 24px",
      }}
    >
      <h1>Open North Standard Sitemap Creator from Shopify</h1>
      <p>
        In your Shopify admin, open Apps and select North Standard Sitemap
        Creator. The app will connect to your store there.
      </p>
      <p>
        Need help? Visit our <a href="/support">support page</a> or read our{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>
    </main>
  );
}
