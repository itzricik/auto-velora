# Netlify and Supabase deployment

## 1. Apply the database

1. Take a Supabase backup. The migration set upgrades the earlier `bookings`,
   `booking_services`, and `booking_status_history` tables transactionally and
   verifies their row counts before removing the temporary legacy schema.
2. Link the repository to the existing project without committing credentials.
3. Run `supabase db push --dry-run` and review the SQL.
4. Run `supabase db push` and apply `supabase/seed.sql`.
5. Confirm `anon` and `authenticated` cannot read `customers`, `vehicles`, `booking_requests`, `booking_items`, or `booking_history`.
6. Create a Supabase Auth administrator and insert its UUID into `admin_profiles`.
7. Disable public Auth sign-up.

If similarly named legacy tables already exist, inspect and migrate their data in a dedicated backup/preview project first. Do not drop production data to make the migration pass.

## 2. Configure Netlify

Add the values from `.env.example` in Site configuration → Environment variables. Use `https://autodetailing-velora.netlify.app` as `PUBLIC_SITE_URL` unless a custom domain replaces it. Set the existing Supabase URL for both `SUPABASE_URL` and `VITE_SUPABASE_URL`, and the anon key for both anon-key variables.

Keep `SUPABASE_SERVICE_ROLE_KEY`, `RATE_LIMIT_SECRET`, and `TURNSTILE_SECRET_KEY` scoped to Functions. Never expose them as `VITE_` variables.

The checked-in CSP allows only the existing Supabase project origin for browser Auth. If the project URL changes, update that one origin in `netlify.toml`.

## 3. Deploy preview checks

- Run `npm ci`, lint, tests, schema validation, and build.
- Submit a fictional booking and confirm rows appear in customer, vehicle, booking, item, and history tables.
- Tamper with a browser price and confirm the server’s price wins.
- Retry one idempotency key and confirm no duplicate booking is created.
- Confirm a second overlapping confirmed booking is rejected.
- Verify EN/LV/RU booking states and mobile layouts.
- Sign in at `/admin`, search/filter bookings, open details, change each valid status, save internal notes, and inspect history.
- Confirm a Supabase Auth user without an active `admin_profiles` row receives `403`.
- Confirm no service-role key or personal data appears in browser storage, HTML, or logs.

## 4. Production release

Deploy only after the migration backup, preview checks, administrator account, privacy wording, data controller, and retention policy have been approved. Monitor the first controlled booking in Netlify Functions and Supabase logs.

Frontend rollback uses a previous Netlify deploy. Database corrections must be forward migrations; never delete booking history during rollback.
