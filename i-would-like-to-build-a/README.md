# Dynamic HTML Sitemap Shopify App

Public Shopify app starter for a dynamic, crawlable HTML sitemap.

## What It Includes

- Shopify React Router app scaffold with embedded admin UI.
- App proxy route for `/apps/html-sitemap`.
- Theme app extension block for Online Store 2.0 themes.
- GraphQL Admin API sync for products, collections, pages, articles, policies, and the main menu.
- Chunked app-data metafields under `html_sitemap`.
- Prisma persistence for shop config, sync status, and generated chunks.
- Vitest coverage for config validation, chunking, truncation, and server-rendered link output.

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env`, fill in Shopify app credentials, and point `DATABASE_URL` at a Postgres database.

3. Create Prisma tables:

   ```bash
   npm run setup
   ```

4. Start the Shopify app tunnel:

   ```bash
   npm run dev
   ```

5. In the Shopify Partner Dashboard, configure the app proxy:

   - Prefix: `apps`
   - Subpath: `html-sitemap`
   - Proxy URL path: `/proxy/html-sitemap`

## Notes

- V1 is a free beta and does not include Shopify Billing.
- The HTML sitemap complements Shopify's XML sitemap; it does not replace it.
- The theme block should be added only to a dedicated page template.
- Navigation menu sync uses `read_online_store_navigation`, which may require Partner Dashboard approval.
