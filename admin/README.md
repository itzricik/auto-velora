# VELORA Administration

Separate React + TypeScript administration application for the VELORA Detail Lab reservation system. It is intentionally deployed as its own Netlify project and shares only the Supabase PostgreSQL project with the public website.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Set the existing Supabase project URL and publishable/anon key for the browser.
3. Set the server-only Supabase service-role key for Netlify Functions. Never prefix it with `VITE_`.
4. Run `npm install` and `npm run dev`.

The browser uses the Supabase publishable key only for Auth. Customer and reservation rows are read and changed exclusively through authenticated Netlify Functions. Each function validates the access token and requires an active `admin_profiles` row.

The schedule uses the configured Riga-time start interval across three independent bays. Service, package, vehicle and condition settings determine duration and estimate ranges on the server. Long reservations continue on the same bay on the next open day. Use **Settings** to manage capacity, calendar exceptions, live prices/durations, multilingual condition rules, service-comparison content, reusable service-specific checklists, and owner-supplied business/legal information.

The reservation editor previews every daily segment before saving. It can assign the lowest-order available bay automatically, use a selected bay, or apply a reservation-specific final-duration override. Marking a reservation completed retains its planned capacity. Use **Complete and release remaining time** only when the vehicle is actually finished early; the action requires confirmation and writes history.

Reservation details include customer/vehicle history, possible-duplicate review and deliberate audited merge, correction/export/anonymisation actions, checklist progress, and private signed vehicle-photo previews. Content management publishes only deliberate case-study copies and externally sourced verified reviews; private booking photos are never promoted automatically.

## Netlify project

Create a new Netlify project from the same repository with:

- Base directory: `admin`
- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- Node.js: 22 LTS

Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `ADMIN_SITE_URL` in the admin Netlify project. `ADMIN_SITE_URL` must exactly match the admin origin.

## First administrator

Public registration is not implemented.

1. In Supabase Dashboard, open Authentication → Users and create the administrator account.
2. Copy that user’s UUID.
3. Run the following in Supabase SQL Editor, replacing both marked values:

```sql
insert into public.admin_profiles (user_id, display_name, role, is_active, active)
values ('REPLACE_WITH_AUTH_USER_UUID', 'REPLACE_WITH_DISPLAY_NAME', 'admin', true, true)
on conflict (user_id) do update
set display_name = excluded.display_name,
    role = excluded.role,
    is_active = true,
    active = true;
```

Do not enable public sign-ups. Deactivating either `active` or `is_active` immediately prevents that account from using the admin functions.

In Supabase Authentication security settings, enable leaked-password protection before production use.

## Verification

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
