# Root & Ritual Botanical Hair Care

React + Vite storefront and admin, Express API, Neon PostgreSQL, and Appwrite Storage.

## Requirements

- Node.js 20 or newer
- A Neon PostgreSQL database
- An Appwrite project, server API key, and Storage bucket

## Local setup

1. Copy `.env.example` to `.env` and fill in the Neon pooled `DATABASE_URL`, direct `DATABASE_URL_UNPOOLED`, a long random `SESSION_SECRET`, your admin email and password, Appwrite server credentials, `WHATSAPP_PHONE`, and the client origin. Keep `.env` private. `NEON_AUTH_BASE_URL` and `NEON_AUTH_JWKS_URL` are supplied by `neon deploy` when `neon.ts` declares `auth: true`.
2. Install packages with `npm install`.
3. Apply the SQL migrations in order with the migration runner:

   ```sh
   npm run migrate
   ```

4. Create the admin and clearly labeled editable demo catalog/homepage with `npm run seed`.
5. Run `npm run dev`. The storefront is at `http://localhost:5173`; admin is at `/admin`.

The migration runner uses the direct `DATABASE_URL_UNPOOLED` connection (falling back to `DATABASE_URL`) and records applied filenames in `schema_migrations`, so it is safe to run again after adding a numbered migration. You can also run the SQL files manually in Neon’s SQL Editor, in numeric order. The app retains its existing bcrypt admin login and PostgreSQL-backed sessions; enabling Neon Auth provisions Managed Auth, but replacing this login requires an explicit identity migration and an owner account in Neon Auth.

For a production server, build the frontend with `npm run build` and run the API with `npm start` behind a TLS reverse proxy. Set `NODE_ENV=production`, use a high entropy session secret, and set `CLIENT_ORIGIN` to the exact public origin. Configure the Appwrite bucket permissions for public read access to product images; only the server API key performs writes.

## Features

- Catalog, category browsing, product stock indicators, product CRUD, and Appwrite image uploads. Uploads accept image files up to 8 MB.
- Persistent browser cart. The server re-reads current prices and locks product rows during checkout; order line items retain name, price, and image snapshots.
- Admin order status management. Inventory is decremented transactionally when a pending order is confirmed.
- WhatsApp click-to-chat handoff after order creation. Configure `WHATSAPP_PHONE` in international digits without `+`.
- CMS tables for site settings, pages, and page sections. Section content/style are JSONB. Only registered section types are accepted; arbitrary database code is never executed.
- Homepage editing for section copy, visibility/order, image upload/replacement, SEO fields, brand colors, fonts, announcement, social/contact settings, and publishing.

## Admin and demo data

The first admin is created by `npm run seed` from `ADMIN_EMAIL` and `ADMIN_PASSWORD`. The seed deliberately refuses the template password. Seeded catalog product titles start with `DEMO ·`; replace all demo content, imagery, prices, and inventory before launch. Seeding is safe to re-run and does not overwrite existing products or homepage settings.

## Checks

- `npm run build` builds the React client.
- `GET /api/health` checks API database connectivity.
- Checkout, admin, uploads, product CRUD, and publishing need configured Neon/Appwrite credentials. Use a staging database for a complete end-to-end pass: sign in, upload a product image, add a product, place an order, confirm it, and verify stock decrement and WhatsApp URL.

## Security notes

Admin passwords use bcrypt (12 rounds). Sessions use an HTTP-only, same-site cookie persisted in PostgreSQL. Admin routes require a session and login is rate limited. API SQL uses positional parameters. Uploads are size/type limited and Appwrite credentials stay on the server. Put the service behind HTTPS, set a unique long `SESSION_SECRET`, rotate credentials, and configure database backups before production.
