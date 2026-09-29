import {
  Form,
  data,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
} from "react-router";
import { LegalPage } from "~/components/legal-page";
import {
  getMarketingSubscriptionByToken,
  unsubscribeFromMarketingByToken,
} from "~/models/marketing-consent.server";

export const meta: MetaFunction = () => [
  { title: "Email Preferences | Standard HTML Sitemap" },
];

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const subscription = params.token
    ? await getMarketingSubscriptionByToken(params.token)
    : null;

  return data({
    available: Boolean(subscription),
    isSubscribed: subscription?.status === "SUBSCRIBED",
  });
};

export const action = async ({ params }: ActionFunctionArgs) => {
  if (!params.token) {
    return data({ success: false }, { status: 404 });
  }

  const subscription = await unsubscribeFromMarketingByToken(params.token);
  return data(
    { success: Boolean(subscription) },
    { status: subscription ? 200 : 404 },
  );
};

export default function Unsubscribe() {
  const { available, isSubscribed } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const unsubscribed = actionData?.success || (available && !isSubscribed);

  return (
    <LegalPage title="Email preferences" effectiveDate="">
      {unsubscribed ? (
        <>
          <h2>You are unsubscribed.</h2>
          <p>
            You will no longer receive North Standard SEO and product update
            emails. Your Shopify sitemap will continue working normally.
          </p>
        </>
      ) : available ? (
        <>
          <p>
            Unsubscribe from North Standard SEO guidance and product update
            emails. This will not affect your Shopify sitemap.
          </p>
          <Form method="post">
            <button className="legal-button" type="submit">
              Unsubscribe
            </button>
          </Form>
        </>
      ) : (
        <p>This email preference link is invalid or has expired.</p>
      )}
    </LegalPage>
  );
}
