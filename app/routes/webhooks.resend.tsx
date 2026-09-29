import type { ActionFunctionArgs } from "react-router";
import { markMarketingUnsubscribedByEmail } from "~/models/marketing-consent.server";
import { verifyResendWebhook } from "~/models/resend-webhook.server";

type ResendContactEvent = {
  type: "contact.updated" | "contact.deleted" | string;
  data?: {
    email?: string;
    unsubscribed?: boolean;
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return new Response("Webhook is not configured.", { status: 503 });
  }

  const payload = await request.text();
  const valid = verifyResendWebhook({
    payload,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
    secret,
  });
  if (!valid) {
    return new Response("Invalid webhook signature.", { status: 400 });
  }

  const event = JSON.parse(payload) as ResendContactEvent;
  const shouldUnsubscribe =
    event.type === "contact.deleted" ||
    (event.type === "contact.updated" && event.data?.unsubscribed === true);

  if (shouldUnsubscribe && event.data?.email) {
    await markMarketingUnsubscribedByEmail(event.data.email);
  }

  return new Response(null, { status: 200 });
};
