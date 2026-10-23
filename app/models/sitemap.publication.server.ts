export type PublicationStatus =
  "LIVE" | "PASSWORD_PROTECTED" | "NOT_FOUND" | "NOT_GENERATED" | "UNAVAILABLE";

export interface PublicationVerification {
  status: PublicationStatus;
  tone: "success" | "warning" | "critical";
  message: string;
  linkCount: number;
}

export async function verifySitemapPublication(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<PublicationVerification> {
  try {
    const response = await fetcher(url, {
      headers: {
        "User-Agent": "North Standard Sitemap Creator publication check",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.text();
    const responsePath = response.url ? new URL(response.url).pathname : "";
    const isPasswordPage =
      responsePath.replace(/\/$/, "") === "/password" ||
      /<form\b[^>]*\baction\s*=\s*["'](?:https?:\/\/[^/"']+)?\/password(?:[?#][^"']*)?["']/i.test(body);

    if (isPasswordPage) {
      return {
        status: "PASSWORD_PROTECTED",
        tone: "warning",
        message:
          "The storefront password is blocking the automated check. Open the sitemap while signed in to Shopify to inspect it.",
        linkCount: 0,
      };
    }

    if (response.status === 404) {
      return {
        status: "NOT_FOUND",
        tone: "critical",
        message:
          "Shopify returned a 404. Confirm that the app proxy is configured and this app version is released.",
        linkCount: 0,
      };
    }

    if (response.ok && body.includes('class="html-sitemap')) {
      const linkCount = (body.match(/class="html-sitemap__link"/g) ?? [])
        .length;

      if (linkCount === 0) {
        return {
          status: "NOT_GENERATED",
          tone: "warning",
          message:
            "The sitemap URL is available, but it has no crawlable links yet. Generate the sitemap, then check again.",
          linkCount: 0,
        };
      }

      return {
        status: "LIVE",
        tone: "success",
        message: `The storefront sitemap is live with ${linkCount.toLocaleString()} crawlable links in its initial HTML.`,
        linkCount,
      };
    }

    if (response.ok) {
      return {
        status: "NOT_GENERATED",
        tone: "warning",
        message:
          "The URL responded, but sitemap markup was not found. Generate the sitemap, then check again.",
        linkCount: 0,
      };
    }

    return {
      status: "UNAVAILABLE",
      tone: "critical",
      message: `The storefront returned HTTP ${response.status}. Try again after confirming the app proxy settings.`,
      linkCount: 0,
    };
  } catch {
    return {
      status: "UNAVAILABLE",
      tone: "critical",
      message:
        "The storefront could not be reached. Check the deployment and try again.",
      linkCount: 0,
    };
  }
}
