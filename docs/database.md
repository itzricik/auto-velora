# Database design

| Table | Purpose |
|---|---|
| `customers` | Normalized contact records |
| `vehicles` | Vehicle make/model linked to a customer and vehicle category |
| `services` | Authoritative multilingual service catalog and integer-cent prices |
| `booking_requests` | Booking lifecycle, schedule, consent, and pricing/vehicle snapshots |
| `booking_items` | Immutable service name, base price, multiplier, calculated price, and duration snapshots |
| `admin_profiles` | Active Supabase Auth administrator/staff roles |
| `booking_history` | Append-only status and internal-note audit trail |

Supporting tables hold vehicle categories, packages, work bays, opening hours, blocked periods, and atomic rate-limit counters.

`create_booking_transactional` performs customer upsert, vehicle creation, booking insertion, item snapshots, and initial history in one PostgreSQL transaction. The function verifies that line-item calculated cents equal the booking total. PostgreSQL’s GiST exclusion constraint prevents overlapping confirmed or in-progress bookings for the same bay, including concurrent requests.

RLS is enabled on every exposed table. No policies grant browser roles access to customer or booking data. The service role may call the narrowly granted security-definer functions and is used only by Netlify Functions.

Applied migrations are forward-only. Never edit one after it has been applied to the shared project; add a reviewed corrective migration.
