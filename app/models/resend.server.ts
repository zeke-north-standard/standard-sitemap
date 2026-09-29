const RESEND_API_URL = "https://api.resend.com";

type FetchLike = typeof fetch;

export class ResendApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ResendApiError";
  }
}

function getApiKey() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Resend is not configured yet.");
  }
  return apiKey;
}

async function resendRequest<T>(
  path: string,
  init: RequestInit,
  fetchImpl: FetchLike = fetch,
) {
  const response = await fetchImpl(`${RESEND_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      "User-Agent": "standard-html-sitemap/1.0",
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as
    (T & { message?: string }) | null;

  if (!response.ok) {
    throw new ResendApiError(
      body?.message || `Resend returned HTTP ${response.status}.`,
      response.status,
    );
  }

  return body as T;
}

export async function upsertResendContact(
  email: string,
  fetchImpl: FetchLike = fetch,
) {
  try {
    return await resendRequest<{ id: string }>(
      `/contacts/${encodeURIComponent(email)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ unsubscribed: false }),
      },
      fetchImpl,
    );
  } catch (error) {
    if (!(error instanceof ResendApiError) || error.status !== 404) {
      throw error;
    }
  }

  return resendRequest<{ id: string }>(
    "/contacts",
    {
      method: "POST",
      body: JSON.stringify({ email, unsubscribed: false }),
    },
    fetchImpl,
  );
}

export async function unsubscribeResendContact(
  email: string,
  fetchImpl: FetchLike = fetch,
) {
  try {
    await resendRequest<{ id: string }>(
      `/contacts/${encodeURIComponent(email)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ unsubscribed: true }),
      },
      fetchImpl,
    );
  } catch (error) {
    if (error instanceof ResendApiError && error.status === 404) return;
    throw error;
  }
}

export async function deleteResendContact(
  email: string,
  fetchImpl: FetchLike = fetch,
) {
  try {
    await resendRequest<{ id: string }>(
      `/contacts/${encodeURIComponent(email)}`,
      { method: "DELETE" },
      fetchImpl,
    );
  } catch (error) {
    if (error instanceof ResendApiError && error.status === 404) return;
    throw error;
  }
}

export async function sendMarketingWelcomeEmail({
  email,
  shop,
  unsubscribeToken,
  fetchImpl = fetch,
}: {
  email: string;
  shop: string;
  unsubscribeToken: string;
  fetchImpl?: FetchLike;
}) {
  const postalAddress = process.env.NORTH_STANDARD_POSTAL_ADDRESS?.trim();
  if (!postalAddress) {
    return { sent: false as const, reason: "POSTAL_ADDRESS_MISSING" as const };
  }

  const appUrl = (
    process.env.SHOPIFY_APP_URL ||
    "https://north-standard-html-sitemap.vercel.app"
  ).replace(/\/$/, "");
  const unsubscribeUrl = `${appUrl}/unsubscribe/${unsubscribeToken}`;
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "North Standard <seo@updates.northstandard.co>";
  const replyTo =
    process.env.RESEND_REPLY_TO?.trim() || "ezekiel@northstandard.co";

  const response = await resendRequest<{ id: string }>(
    "/emails",
    {
      method: "POST",
      headers: {
        "Idempotency-Key": `sitemap-welcome-${shop}`,
      },
      body: JSON.stringify({
        from,
        to: [email],
        reply_to: replyTo,
        subject: "Your storefront sitemap is ready",
        html: welcomeEmailHtml({ shop, unsubscribeUrl, postalAddress }),
        text: welcomeEmailText({ shop, unsubscribeUrl, postalAddress }),
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    },
    fetchImpl,
  );

  return { sent: true as const, id: response.id };
}

function welcomeEmailHtml({
  shop,
  unsubscribeUrl,
  postalAddress,
}: {
  shop: string;
  unsubscribeUrl: string;
  postalAddress: string;
}) {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f6f6f4;color:#202223;font-family:Arial,sans-serif">
    <div style="max-width:600px;margin:0 auto;padding:40px 24px">
      <div style="background:#ffffff;border:1px solid #dedede;padding:32px">
        <p style="margin:0 0 20px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">North Standard</p>
        <h1 style="font-size:28px;line-height:1.2;margin:0 0 18px">Your sitemap is ready.</h1>
        <p style="font-size:16px;line-height:1.6;margin:0 0 16px">Standard HTML Sitemap is connected to ${escapeHtml(shop)}. We&apos;ll send occasional practical SEO guidance and updates about new North Standard tools.</p>
        <p style="font-size:16px;line-height:1.6;margin:0">You can keep managing your sitemap from Shopify Admin at any time.</p>
      </div>
      <p style="color:#616161;font-size:12px;line-height:1.6;margin:20px 0 0">You received this because you opted in inside Standard HTML Sitemap. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#006fbb">Unsubscribe</a><br>${escapeHtml(postalAddress)}</p>
    </div>
  </body>
</html>`;
}

function welcomeEmailText({
  shop,
  unsubscribeUrl,
  postalAddress,
}: {
  shop: string;
  unsubscribeUrl: string;
  postalAddress: string;
}) {
  return `Your sitemap is ready.\n\nStandard HTML Sitemap is connected to ${shop}. We'll send occasional practical SEO guidance and updates about new North Standard tools.\n\nYou received this because you opted in inside Standard HTML Sitemap. Unsubscribe: ${unsubscribeUrl}\n\n${postalAddress}`;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] || character,
  );
}
