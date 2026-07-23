# Database

## Tables

| Table | Purpose |
|---|---|
| `vehicle_categories` | Multilingual vehicle labels and price/duration multipliers |
| `services` | Active service catalog in integer cents/minutes |
| `service_packages` | Fixed package prices and durations |
| `package_services` | Package/service membership |
| `work_bays` | Physical detailing capacity |
| `business_hours` | Weekday and effective-date opening rules |
| `blocked_periods` | Studio-wide or bay-specific closures |
| `customers` | Normalized contact records, deduplicated by email + phone |
| `bookings` | Time, lifecycle, pricing snapshots, consent and token hash |
| `booking_services` | Historical service-name/price/duration snapshots |
| `booking_status_history` | Append-only lifecycle audit trail |
| `admin_profiles` | Active Auth-user role/profile |
| `notification_logs` | Resend attempt/outcome records |
| `api_rate_limits` | Short-lived HMAC identifiers and atomic counters |

Money is stored as integer euro cents. Time is stored as `timestamptz`; presentation uses `Europe/Riga`. A raw management token and raw IP address are never stored.

## Constraints and transactions

`bookings_no_overlapping_active` is a GiST exclusion constraint over:

```sql
work_bay_id WITH =,
tstzrange(starts_at, ends_at, '[)') WITH &&
```

It applies only to `confirmed` and `in_progress`. The half-open range permits one booking to start exactly when another ends.

`create_booking_transactional`:

1. returns an existing booking for the same idempotency UUID;
2. upserts the normalized customer;
3. iterates active bays while respecting blocks;
4. inserts the booking and snapshots in one transaction;
5. writes initial status history;
6. retries another bay after an exclusion conflict;
7. raises SQLSTATE `23P01` if capacity is gone.

In manual mode, requested bookings can overlap. `admin_update_booking` takes a row lock and the exclusion constraint rechecks capacity when a requested booking becomes confirmed.

## RLS and privileges

RLS is enabled on every application table. There are deliberately no `anon` or `authenticated` policies; PostgreSQL therefore denies rows by default. Table/sequence privileges are revoked from those roles. `service_role` is explicitly granted server access and also bypasses RLS in Supabase.

This design avoids exposing catalog and booking tables through the browser PostgREST API. Public catalog/availability reads also go through Functions.

## Migrations and seed

- `202607230001_phase2_schema.sql`: schema, indexes, constraints, triggers, RLS.
- `202607230002_booking_rpcs.sql`: service-role-only booking/cancellation/rate-limit RPCs.
- `202607230003_admin_operations.sql`: service-role-only audited admin RPC.
- `seed.sql`: public catalog, one bay and opening hours; no customer/booking fixtures.

Do not rewrite an applied migration. Add a new migration and test forward/rollback operational procedures in a dedicated project.

## Verification

Static validation:

```bash
npm run test:schema
```

Local integration:

```bash
supabase start
supabase db reset
supabase test db
bash scripts/test-concurrent-booking.sh
```

pgTAP verifies schema, uniqueness, deny-by-default access, service-role privilege, active-overlap rejection and cancelled-overlap allowance. The shell test runs concurrent transactions and fails unless PostgreSQL rejects the second overlapping confirmed insert.

## Backup and retention

Backups and point-in-time recovery depend on the selected Supabase plan and remain an owner decision. Before API activation:

- define retention for bookings, customers, notification logs and audit records;
- define how deletion requests preserve legally required minimal audit data;
- enable and test backup restoration;
- assign an operator for recovery;
- schedule cleanup for expired `api_rate_limits`.
