# Administrator guide

## First administrator

1. Create the real user manually in Supabase Auth.
2. Require a unique strong password and enable the organization's chosen MFA policy when available.
3. Copy the Auth user UUID.
4. Run:

```sql
insert into public.admin_profiles (user_id, role, display_name, is_active)
values ('<AUTH_USER_UUID>', 'admin', '<REAL_DISPLAY_NAME>', true);
```

Use `staff` for users who must not export CSV. Deactivate a user by setting `is_active = false` and revoke Auth sessions as appropriate.

## Sign in

Open `/admin` on the configured preview/site origin. Credentials go to Supabase Auth; the application does not contain a fallback password. A valid Auth user without an active profile is refused by the server.

## Booking dashboard

Summary counters show today, tomorrow, upcoming, requested, confirmed and cancelled records. Use date/status filters or search by reference, customer, phone, email or vehicle.

Open a table row with click/tap or Enter. Details show customer contact, vehicle, service snapshots, customer note, internal note and status history.

## Lifecycle actions

Allowed transitions:

- requested → confirmed, rejected or cancelled;
- confirmed → in progress, cancelled or no-show;
- in progress → completed or cancelled.

The database rejects invalid transitions. Confirming a requested booking rechecks availability and can return a conflict if another booking now uses that bay. Rescheduling also checks blocked periods and active overlaps.

Use internal notes only for operational information. Do not store passwords, payment-card data, health data or unrelated personal information.

## Availability

The Availability view shows configured hours and work bays. A block with no bay selected closes the whole studio. A bay-specific block removes only that bay. Start must be before end and the reason is required.

Removing a block does not alter existing bookings.

## CSV export

Only `admin` can export. The UTF-8 BOM makes the file Excel-compatible. It includes customer contact details and must be handled as personal data:

- store only in an approved location;
- do not email it casually or attach it to GitHub;
- delete temporary copies;
- follow the approved retention and access-request process.

No management token or internal token hash is exported.

## Customer support

Use the reference to find a booking, but never disclose details based on a reference alone. The public management page requires its secure token. Administrator changes create status history and customer/owner notifications for supported events.

If email delivery fails, the booking still exists. Confirm the booking in the dashboard and use the owner's approved contact procedure; never copy secret management links into public channels.

## Sign out and incident response

Sign out when leaving a shared device. If an account or device may be compromised:

1. deactivate the profile;
2. revoke Supabase sessions;
3. rotate affected credentials;
4. review audit/status history and sanitized function logs;
5. follow the approved privacy incident process.
