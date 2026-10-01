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

1. **Production positioning:** The app and Terms still call this a free beta.
   Shopify cautions that beta submissions can be delayed or rejected. Decide
   when the product is ready for production, then review and update the Terms,
   dashboard limit wording, and README together. Have counsel review legal copy.
2. **App name:** `North Standard Sitemap Creator` is the approved name and is
   exactly 30 characters, Shopify's limit. Verify that Shopify accepts it in
   the Dev Dashboard and use it in the listing and any media.
3. **Icon:** `public/standard-sitemap-app-icon.png` is 1254 x 1254 pixels.
   Export a 1200 x 1200 PNG from the approved design and upload it in the
   Shopify Dev Dashboard. The repository image is not the listing upload.
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
7. **Hosting:** The Vercel account is currently on Hobby. Vercel restricts it
   to non-commercial personal use; this app's business and lead-generation
   purpose likely requires Pro or another commercial-eligible host, even while
   the app is free. Confirm with Vercel Support if needed. Verify database
   capacity and production error monitoring as well.
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
11. **Scope minimization:** `write_content` is required at install today, even
    though it only supports the optional dedicated-page workflow. Consider
    requesting it as an optional permission at the moment the merchant chooses
    to create a page, then test both the grant and denial paths.

## Draft listing copy

Use these only after the production positioning is approved.

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
