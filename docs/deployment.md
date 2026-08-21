# Netlify and Supabase deployment

The detailed two-site procedure is in [separate-admin-deployment.md](separate-admin-deployment.md). Do not configure the public and admin applications as one Netlify site.

## Database

1. Back up the existing Supabase project.
2. Apply every migration in `supabase/migrations/` in filename order. Never edit an already applied migration.
3. Apply `supabase/seed.sql` only when the service catalogue needs initializing or reconciling.
4. Confirm RLS is enabled and `anon`/`authenticated` have no table privileges on customer, reservation, slot, history, or admin data.
5. Disable public Auth sign-up, create the first Auth user manually, and activate its `admin_profiles` row as documented in `admin/README.md`.

## Public Netlify project

- Base directory: repository root
- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

Keep `SUPABASE_SERVICE_ROLE_KEY`, `RATE_LIMIT_SECRET`, and `TURNSTILE_SECRET_KEY` server-only. The deployed public form reads nearest/alternative starts from `/api/availability` and submits to `/api/create-reservation`; the function reloads the catalogue, recalculates price and exact duration, verifies the complete schedule, assigns one available bay, stores pending expiry and immutable snapshots, and creates every daily segment transactionally.

## Admin Netlify project

- Base directory: `admin`
- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions` relative to the admin base

Set the browser-safe Supabase URL and anon key for Auth. Keep the service-role key server-only. Set `ADMIN_SITE_URL` to the exact final admin origin and update the admin CSP Supabase origin if the shared project changes.

## Release checks

- Run lint, TypeScript, tests, and production builds in both projects.
- Confirm a public selection shows only starts where at least one bay can fit the complete duration.
- Confirm a submitted reservation appears on one bay for every required daily segment.
- Confirm a long service resumes at the next open time and skips closed dates.
- Confirm a concurrent request for the final available bay is rejected and no partial reservation remains.
- Confirm cancellation and `no_show` release all future segments.
- Confirm pending expiry releases capacity and appends history.
- Confirm block/unblock, completed capacity retention, and the separately confirmed **Complete and release remaining time** action.
- Confirm package duration is used instead of the sum of package items and package snapshots are stored.
- Confirm an Auth user without an active profile receives `403`.
- Confirm no service-role key or customer data appears in HTML, browser storage, or logs.

Deploy only after the real privacy contact, data-controller identity, and retention policy are approved. Frontend rollback uses a prior Netlify deploy; database corrections use a new forward migration.
