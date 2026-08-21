# Separate public and admin deployment

## Architecture

```text
Public Netlify project                    Admin Netlify project
autodetailing-velora                     separate admin origin
  React public website                     React admin application
  create-reservation function              authenticated admin functions
             \                               /
              \-- one Supabase project ----/
                    PostgreSQL + Auth
```

The public browser cannot query customer, reservation, slot, history, or admin tables. It sends a validated request to `create-reservation`, which recalculates the estimate and calls a transactional RPC with the service-role key. The admin browser signs in through Supabase Auth using the publishable/anon key, then calls its same-origin Netlify Functions. Those functions validate the user and active admin profile before using the server-only service-role key.

## Database migration

Apply all files in `supabase/migrations/` in filename order to the same Supabase project used by the public website. Local filenames intentionally match the migration versions recorded by the existing Supabase project, through `20260814102055_fix_admin_transaction_ambiguity.sql`. Then run `supabase/seed.sql` only when the version-controlled service catalogue must be initialized or reconciled.

The scheduling migrations add three work bays, configurable regular and exceptional hours, service/package duration and buffer configuration, timezone-aware reservation segments, one private planning engine, transactional public/admin save functions, pending expiry, package snapshots, explicit browser-deny RLS policies, and same-bay GiST exclusion constraints. Cancelled, expired and no-show reservations release future capacity without deleting history.

## Public Netlify project

Keep the existing project settings and add the new function from the repository root. Required environment variables remain:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server only
- `PUBLIC_SITE_URL=https://autodetailing-velora.netlify.app`
- `RATE_LIMIT_SECRET`
- `BOOKING_MIN_NOTICE_HOURS`
- `BOOKING_MAX_DAYS_AHEAD`
- optional Turnstile variables
- browser variables already used by the current public deployment

The public form loads server-calculated availability after a vehicle and service selection, then submits a requested start. A successful request is assigned to one available bay and all daily segments are stored atomically. Browser-supplied prices, durations, bay IDs, and end times are ignored.

## Admin Netlify project

Create a second site from the same GitHub repository and set its base directory to `admin`. Follow `admin/README.md` for build settings and the first-administrator procedure.

The two Netlify projects must use the same `SUPABASE_URL`, but each maintains its own environment settings. Never copy `SUPABASE_SERVICE_ROLE_KEY` into a variable whose name starts with `VITE_`.

## Deployment order

1. Back up the Supabase database.
2. Apply the SQL migration.
3. Confirm the existing admin profile gained `active = true`.
4. Deploy the new admin Netlify project and verify sign-in, the three-bay timeline, settings, preview, blocking, multi-day creation, duration extension, cancellation, completed retention, and explicit release.
5. Deploy the public site update.
6. Submit one clearly identified test reservation from the public form, confirm every segment appears on one bay, then cancel it and verify future capacity becomes available.

No company address, phone, email, Instagram URL, privacy contact, data-controller identity, retention period, or credential is supplied or invented by this change.
