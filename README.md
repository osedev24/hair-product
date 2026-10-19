# Root & Ritual Botanical Hair Care

React + Vite storefront and admin, Express API, Neon PostgreSQL, and local or Vercel Blob image storage.

## Requirements

- Node.js 20 or newer
- A Neon PostgreSQL database
- For Vercel production uploads, a Vercel Blob store (its token is added to the project automatically)

## Local setup

1. Copy `.env.example` to `.env` and fill in the Neon pooled `DATABASE_URL`, direct `DATABASE_URL_UNPOOLED`, a long random `SESSION_SECRET`, your admin email and password, `WHATSAPP_PHONE`, and the client origin. Keep `.env` private. `VITE_UPLOAD_PROVIDER=local` keeps local uploads during development. `NEON_AUTH_BASE_URL` and `NEON_AUTH_JWKS_URL` are supplied by `neon deploy` when `neon.ts` declares `auth: true`.
2. Install packages with `npm install`.
3. Apply the SQL migrations in order with the migration runner:

   ```sh
   npm run migrate
   ```

4. Create the admin and clearly labeled editable demo catalog/homepage with `npm run seed`.
5. Run `npm run dev`. The storefront is at `http://localhost:5173`; admin is at `/admin`.

The migration runner uses the direct `DATABASE_URL_UNPOOLED` connection (falling back to `DATABASE_URL`) and records applied filenames in `schema_migrations`, so it is safe to run again after adding a numbered migration. You can also run the SQL files manually in Neon’s SQL Editor, in numeric order. The app retains its existing bcrypt admin login and PostgreSQL-backed sessions; enabling Neon Auth provisions Managed Auth, but replacing this login requires an explicit identity migration and an owner account in Neon Auth.

## Deploy to Vercel

1. Push this project to a GitHub repository and import it into Vercel. Keep `.env`, `uploads/`, and other secrets out of Git.
2. Add a Vercel Postgres-compatible Neon database and set `DATABASE_URL` (pooled connection), `DATABASE_URL_UNPOOLED` (direct connection), `SESSION_SECRET` (at least 32 random characters), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `WHATSAPP_PHONE`, `DELIVERY_FEE`, and `NODE_ENV=production` in Vercel Project Settings → Environment Variables. Set `CLIENT_ORIGIN` to the deployed site origin if you use a separate API origin; same-origin hosting normally does not need CORS.
3. In Vercel Storage, create and connect a Blob store. Add `VITE_UPLOAD_PROVIDER=vercel-blob` as a build environment variable so admin uploads go directly from the browser to Blob. Vercel supplies `BLOB_READ_WRITE_TOKEN` when the store is connected.
4. Apply migrations to the intended production database with `npm run migrate` using its direct connection, then create the first admin with `npm run seed` against that same database. Review seed data and replace demo catalog and homepage content.
5. Redeploy after configuring environment variables. Check `/api/health`, sign into `/admin`, and upload an image. Local files in `uploads/` are not deployed; upload them again through admin after launch.

Vercel uses `api/[...path].js` to route `/api/*` requests to Express; `vercel.json` routes other paths to the Vite SPA. The frontend build command is `npm run build` and the output directory is `dist` (Vercel detects Vite automatically).

For a traditional production server instead, build with `npm run build` and run the API with `npm start` behind a TLS reverse proxy. Set `NODE_ENV=production`, use a high entropy session secret, and set `CLIENT_ORIGIN` to the exact public origin. Local product images are saved in `uploads/`; use persistent storage and backups, or set `UPLOAD_DIR` to another persistent directory.

## Features

- Catalog, category browsing, product stock indicators, product CRUD, and local/Vercel Blob image uploads. Uploads accept image files up to 8 MB.
- Persistent browser cart. The server re-reads current prices and locks product rows during checkout; order line items retain name, price, and image snapshots.
- Admin order status management. Inventory is decremented transactionally when a pending order is confirmed.
- Editable checkout form fields in the homepage editor. Fields can be added, hidden, removed, relabeled, and marked required; submitted answers are stored with each order.
- WhatsApp click-to-chat handoff after order creation. Configure `WHATSAPP_PHONE` in international digits without `+`.
- CMS tables for site settings, pages, and page sections. Section content/style are JSONB. Only registered section types are accepted; arbitrary database code is never executed.
- Homepage editing for section copy, visibility/order, image upload/replacement, SEO fields, brand colors, fonts, announcement, social/contact settings, and publishing.

## Admin and demo data

The first admin is created by `npm run seed` from `ADMIN_EMAIL` and `ADMIN_PASSWORD`. The seed deliberately refuses the template password. Seeded catalog product titles start with `DEMO ·`; replace all demo content, imagery, prices, and inventory before launch. Seeding is safe to re-run and does not overwrite existing products or homepage settings.

## Checks

- `npm run build` builds the React client.
- `GET /api/health` checks API database connectivity.
- Checkout, admin, uploads, product CRUD, and publishing need configured Neon credentials. Use a staging database for a complete end-to-end pass: sign in, upload a product image, add a product, place an order, confirm it, and verify stock decrement and WhatsApp URL.

## Security notes

Admin passwords use bcrypt (12 rounds). Sessions use an HTTP-only, same-site cookie persisted in PostgreSQL. Admin routes require a session and login is rate limited. API SQL uses positional parameters. Uploads are size/type limited. Put the service behind HTTPS, set a unique long `SESSION_SECRET`, rotate credentials, and configure database backups before production.
