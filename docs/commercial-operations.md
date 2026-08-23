# Commercial operations

## Booking authority

The browser selects database IDs and displays previews only. Netlify Functions reload active services, packages, vehicle multipliers and condition rules, then PostgreSQL creates or changes the reservation and every same-bay segment in one transaction. The GiST exclusion constraints are the final double-booking guard. Price, duration, availability, bay IDs and condition modifiers supplied by a browser are never authoritative.

Three bays are active by default. Work is counted only inside the configured `Europe/Riga` opening periods and continues on the same bay on the next open day. Calendar exceptions can close a date or provide special hours. Cancelled, expired and no-show reservations release future capacity while keeping history.

## Condition estimates

Condition levels and indicators carry active flags, EN/LV/RU explanations, minimum/maximum surcharge cents and minimum/maximum work minutes. The public range is recalculated on the server and stored as an immutable reservation snapshot. Owner inspection still determines the final price and duration. Substantial administrator changes require a reason and append history.

## Private photographs

Customer and admin photographs use the private `reservation-media` bucket. The prepare endpoint creates an owned metadata row and a path-bound signed upload. Finalization succeeds only when PostgreSQL can verify the object path, size and MIME metadata. Admin reads use five-minute signed URLs; the database stores only the private object path.

Accepted images are JPEG, PNG or WebP, six customer images maximum and 8 MB each. The public client re-encodes camera images through a correctly oriented canvas where the browser supports it, reduces dimensions when useful, and strips ancillary metadata. A failed optional upload remains individually retryable and does not clear the booking form.

Private booking media is never a public case-study asset. Public case images require a separate deliberate administrator record with a permanent HTTPS URL and confirmed publication rights.

## Checklists and completion

Active services map to reusable templates. Confirmation materializes label/required snapshots into the reservation. Staff can check/uncheck items, leave notes and add one-off steps; every completion stores actor and time. Required incomplete items block completion. Only an active `admin` can deliberately override the block with a recorded reason.

## Notifications

Reservation triggers and the hourly worker add idempotent outbox events. Workers atomically claim rows with `skip locked`, retry temporary failures with bounded backoff, store a short provider reference, and avoid storing provider response bodies.

- `disabled`: records suppressed delivery and contacts nobody.
- `test`: contacts nobody; use this while validating templates and event generation.
- `live`: uses Resend and the configured customer/admin recipients.

Required live variables are `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and `BOOKING_OWNER_EMAIL`. Set `NOTIFICATION_TEST_RECIPIENT` during controlled validation. Missing provider configuration marks delivery failed and queues one administrator failure event, but never rolls back a valid booking.

## Customer records and privacy

New bookings reuse an unambiguous normalized phone/email match transactionally. Uncertain matches remain separate and are shown as possible duplicates. Admin merge is deliberate, preserves reservations/vehicles and writes history. Correction, JSON export and anonymisation are protected actions. Active reservations block anonymisation; anonymisation removes private media and replaces direct identifiers while preserving operational/financial history.

The owner must configure and approve the legal entity, registration number, address/contact details, privacy contact, retention period, booking terms, cancellation policy, privacy notice and photo-processing wording. Empty factual values remain hidden publicly.

## Recovery

Before release, take a Supabase backup and verify migrations in a local database or development branch. All production schema corrections are new forward migrations. If a migration causes an application incompatibility, roll back the Netlify deploy first, disable affected write endpoints if needed, preserve the database, and ship a corrective migration. Use Supabase PITR/backup restore only for a verified data-loss incident.
