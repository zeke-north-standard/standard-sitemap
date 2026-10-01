# Shopify App Store Submission Prep

This is a working draft, not authorization to submit. Review all merchant-facing
copy, legal terms, and the live app before requesting Shopify review.

## Verified in the repository

- Embedded Shopify app using App Bridge and the GraphQL Admin API.
- App proxy at `/apps/html-sitemap`, with a theme-integrated storefront response.
- Published-content sitemap, preview, manual refresh, optional footer link, and
  optional dedicated page block.
- Mandatory customer-data and shop-redaction webhook subscriptions.
- Public URLs: [Privacy](https://north-standard-html-sitemap.vercel.app/privacy),
  [Terms](https://north-standard-html-sitemap.vercel.app/terms), and
  [Support](https://north-standard-html-sitemap.vercel.app/support).
- Marketing email requires a separate opt-in and has unsubscribe controls.
- No app billing. The service is currently free.

## Resolve before submission

1. **Production positioning:** The app, Terms, and README now describe a free
   service. Review the Terms and free-service description before submitting,
   ideally with legal counsel.
2. **App name:** `North Standard Sitemap Creator` is the approved name and is
   exactly 30 characters, Shopify's limit. Verify that Shopify accepts it in
   the Dev Dashboard and use it in the listing and any media.
3. **Icon:** `public/standard-sitemap-app-icon.png` is a 1200 x 1200 PNG
   under 1 MB.
   Upload this file in the Shopify Dev Dashboard. The repository image is not
   automatically used as the App Store listing icon.
4. **Storefront review:** Run a clean install on a second development store.
   Test OAuth, first sitemap generation, publication, manual refresh, optional
   permissions, footer-link insertion, theme block, uninstall, and reinstall.
   Make a demo storefront accessible to reviewers; the current dev store's
   password page can hide the actual sitemap from unauthenticated visitors.
5. **Listing media:** Prepare 3-6 distinct 1600 x 900 screenshots showing the
   actual UI and storefront (no browser chrome or personal data). Record an
   English screencast covering install, generation, publication, and footer
   setup. Shopify requires a setup screencast for review.
6. **Business details:** Use `support@northstandard.co` for merchant support.
   Add a submission email and emergency developer email and phone in the Dev
   Dashboard. Verify the postal address used in opt-in email, privacy
   practices, and Terms with your business. If Vercel has a `RESEND_REPLY_TO`
   variable, change its value to `support@northstandard.co` and redeploy.
7. **Hosting:** The Vercel account has been upgraded to Pro. Verify database
   capacity and production error monitoring before accepting public traffic.
8. **Store scale:** The app intentionally caps a sitemap at 5,000 links. Decide
   whether that supports the merchants you want to serve. Describe the limit
   accurately in support and the listing if it remains.
9. **Webhook reliability:** Product and collection webhooks currently perform
   the whole sitemap sync before returning. Shopify expects a response within
   five seconds, so move refresh work into a durable queue or scheduled
   reconciliation flow and test a large store before public launch.
10. **Deletion retries:** If Resend contact deletion fails during uninstall or
    shop redaction, the current code logs the failure and deletes the local
    subscription record. That loses the information needed for a retry. Make
    provider deletion retry-safe and verify the privacy workflow end to end.
11. **Scope minimization:** `write_content` is requested only when the
    merchant chooses the optional dedicated-page workflow. Test both the
    grant and denial paths on a clean installation.

## Draft listing copy

Review this copy alongside the final app before submitting.

- **Name:** North Standard Sitemap Creator
- **App card subtitle:** Help shoppers explore your store with a clear HTML sitemap
- **Introduction:** Create a browseable sitemap that fits your storefront and helps visitors find content.
- **Details:** Create a human-readable HTML sitemap for your Online Store from published products, collections, pages, articles, policies, and navigation links. Preview the result, choose its sections and appearance, and publish it at a storefront URL. Add a sitemap link to a footer menu from the app or place the optional app block on a dedicated page. Refresh after changing pages, articles, policies, or navigation. The sitemap complements, but does not replace, Shopify's XML sitemap. A 5,000-link limit applies.
- **Feature:** Generate a sitemap from published store content.
- **Feature:** Preview and customize the sitemap's sections and layout.
- **Feature:** Publish a sitemap that uses your storefront theme.
- **Feature:** Add a sitemap link to a footer menu.
- **Pricing:** Free; no in-app charges.
- **Primary language:** English only, until the admin UI is translated.
- **Sales channel requirement:** Merchant must have Online Store.
- **Privacy policy URL:** https://north-standard-html-sitemap.vercel.app/privacy
- **Support URL:** https://north-standard-html-sitemap.vercel.app/support
- **Support email:** support@northstandard.co
- **Terms URL:** https://north-standard-html-sitemap.vercel.app/terms

Do not promise rankings, indexing, sales, or automatic refresh for every
section. The current product/collection webhooks refresh those sections;
changes to other sections require the merchant to select Refresh sitemap.

## Clear the five listing-field issues

These fields are entered in the Shopify Dev Dashboard, not deployed from this
repository. Do not submit the app until the assets show the current product.

1. **Feature media:** Upload one 1600 x 900 image with the actual sitemap or
   admin UI as its focal point. Do not use the app icon alone. Add descriptive
   alt text, such as "Storefront HTML sitemap with navigation and content
   links."
2. **Screenshots:** Upload 3-6 distinct 1600 x 900 desktop captures. Suggested
   set: generated sitemap and preview; themed storefront sitemap with header
   and footer; appearance and section controls; footer-menu setup. Crop out
   browser chrome and personal data. Do not use the old screenshot of the
   unthemed app proxy or any screen with an error banner.
3. **Plan display names:** In the English listing's Pricing details, set the
   existing free public plan's display name to `Free`. Suggested top features:
   "HTML sitemap for published content", "Appearance and section controls",
   and "Storefront URL and footer-menu link". State the 5,000-link limit in
   the plan description if the form provides space. Do not add a paid plan.
4. **Screencast URL:** Record a reviewer-facing walkthrough on a clean store:
   install and open the app, generate and preview, open the themed storefront
   sitemap, save an appearance change, and add a footer link. Show optional
   permission prompts where relevant. Use an English narration or subtitles,
   and enter a video URL that reviewers can open without signing in.
5. **Testing instructions:** Paste and adapt the instructions below. Supply a
   storefront password or other test credentials separately if the review
   store requires them; do not put secrets in this repository.

### Testing instructions to paste

North Standard Sitemap Creator has no separate account, external login, or
paid plan. Install it on a Shopify test store with the Online Store channel and
some published products, collections, and pages. Open the app from Shopify
Admin. Select Generate sitemap, then check the link counts and HTML preview.
Select Open live sitemap to view `/apps/html-sitemap` in the storefront; it
should use the store theme. Select Check publication to verify the URL. Change
an appearance or section setting and select Save and refresh sitemap. In the
footer-menu area, choose a menu and select Add Sitemap link; approve the
optional navigation permission if prompted, then confirm the theme displays
that menu. Policy access and the dedicated sitemap page are optional features.
The dedicated page requests content-write permission only when selected and
its app block belongs on a dedicated page template. Marketing email opt-in is
optional and is not needed to use the sitemap. If the test store has a
storefront password, provide it in the secure testing-credentials field so
reviewers can inspect the live sitemap.

## Reviewer walkthrough

1. Install from Shopify's App Store review flow. The app opens embedded in
   Shopify admin without an additional login or external account.
2. In the app, select Generate sitemap. Review the link counts and HTML preview.
3. Select Open live sitemap and Check publication. The URL is
   `https://<review-store>/apps/html-sitemap`.
4. Change included sections or appearance and select Save and refresh sitemap.
5. Select a footer menu and Add Sitemap link. Shopify requests the optional
   navigation-write permission; verify the theme actually displays that menu.
6. If policies are absent, use Grant policy access and refresh. This is an
   optional permission.
7. Optionally create a dedicated page and add the app block to a dedicated
   page template. Do not add it to the shared default page template.
8. Marketing opt-in is optional and never required to use the sitemap.

## Dashboard sequence

In Shopify Dev Dashboard, open the app's **App Store review** page. Complete
configuration, listing, pricing, eligibility, contact, media, and reviewer
instructions. Select **Merchant must have online store**. Run the automated
checks and address every failure. Submit for review only after the clean-store
test and production-readiness items above pass.

References: [App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements),
[submission process](https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review),
[listing guidance](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices),
[Vercel commercial-use guidelines](https://vercel.com/docs/limits/fair-use-guidelines).
