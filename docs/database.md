# Database design

| Table | Purpose |
|---|---|
| `customers` | Normalized name, phone, and optional email |
| `vehicles` | Customer vehicle and vehicle type |
| `services` | Authoritative multilingual catalogue, integer-cent base price, and duration in minutes |
| `reservations` | Reservation lifecycle, source, pending expiry, selected bay, total/final duration, package snapshots, and schedule bounds |
| `reservation_services` | Immutable service-name, base-price, calculated-price, duration, and buffer snapshots |
| `reservation_segments` | Daily timezone-aware work segments for one reservation and bay |
| `work_bays` | Three independently configurable detailing bays |
| `business_hours` | Regular weekly Riga opening hours |
| `business_hour_exceptions` | Holidays, closures, and special-date hours |
| `blocked_periods` | Manual capacity blocks for a bay |
| `admin_profiles` | Active Supabase Auth administrator roles |
| `reservation_history` | Append-only operational audit trail |

`scheduling_availability` and `admin_scheduling_preview` are service-role-only wrappers around one planner in the non-exposed `private` schema. The planner reads effective Riga business hours, skips closed dates, keeps all work on one bay, checks manual blocks and capacity, and applies the configured search increment.

`create_scheduled_reservation_transactional_v2` receives only server-calculated totals and snapshots, verifies the selected start again, selects one available active bay, and creates the customer, vehicle, pending reservation, snapshots, history, package snapshot when applicable, and every required daily segment together.

`admin_save_duration_reservation_v3` performs the same atomic operation for administrator-created and edited reservations, including duration overrides, movement, same-bay segment replacement and source preservation. Half-open PostgreSQL range exclusion constraints prevent overlaps with reservations and manual blocks at the database level. A conflict rolls back the whole call. Cancellation, expiry and `no_show` make capacity non-occupying while the audit history keeps the prior plan. Completed reservations retain capacity until `admin_release_reservation_capacity` is invoked explicitly.

RLS is enabled on every exposed operational table and browser roles have no direct table privileges. The service role is used only inside the two projects' Netlify Functions. Money is stored as integer euro cents, and service prices are recalculated from active database rows before the initial public request is written.

## Recovery strategy

Applied migrations are forward-only. Take a Supabase backup before release and never edit a migration after it has been applied to the shared project. If a database defect is found, stop public booking writes, preserve reservation/history rows, restore from the approved backup only when data loss is understood, and add a reviewed forward corrective migration. Frontend rollback uses the previous immutable Netlify deploy. Existing rows without enough scheduling information remain marked `legacy`; assign a real bay, services and duration through the admin editor rather than inventing historical segments.
