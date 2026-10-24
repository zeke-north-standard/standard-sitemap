import type { ActionFunctionArgs } from "react-router";
import { markMarketingUnsubscribedByEmail } from "~/models/marketing-consent.server";
import { verifyResendWebhook } from "~/models/resend-webhook.server";
import { validateMarketingEmail } from "~/models/marketing-consent";

type ResendContactEvent = {
  type: "contact.updated" | "contact.deleted" | string;
  data?: {
    id?: string;
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

  let event: ResendContactEvent;
  try {
    const parsed: unknown = JSON.parse(payload);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return new Response("Invalid webhook payload.", { status: 400 });
    }
    event = parsed as ResendContactEvent;
  } catch {
    return new Response("Invalid webhook payload.", { status: 400 });
  }
  const shouldUnsubscribe =
    event.type === "contact.deleted" ||
    (event.type === "contact.updated" && event.data?.unsubscribed === true);

  if (shouldUnsubscribe && typeof event.data?.email === "string" && event.data.email.trim() &&
      typeof event.data.id === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(event.data.id)) {
    let email: string;
    try { email = validateMarketingEmail(event.data.email); }
    catch { return new Response(null, { status: 200 }); }
    await markMarketingUnsubscribedByEmail(email, event.data.id);
  }

  return new Response(null, { status: 200 });
};
