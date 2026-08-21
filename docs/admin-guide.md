# Administrator guide

Open the separately deployed admin site and sign in with a Supabase Auth account that has `admin_profiles.active = true`. Credentials are sent directly to Supabase Auth; there is no shared fallback password and no public registration.

The dashboard has three operational views:

- **Schedule** shows 30-minute start points from the selected day's effective opening hours across Bay 1, Bay 2, and Bay 3. Select a free bay/time cell to create a reservation or block working time. Select an occupied cell to edit, reschedule, complete, or cancel the reservation.
- **New requests** lists incoming requests that have not yet been assigned. Search by reference, customer, phone, email, or vehicle, then select an active bay and start time to confirm the reservation.
- **Settings** activates/deactivates bays; changes regular weekly opening hours, holidays and special hours; configures the public-search interval and pending hold; and manages service/package work minutes, buffers and active state. All times are interpreted in `Europe/Riga`.

Reservation statuses:

- `pending` - submitted but not yet confirmed;
- `confirmed` - assigned to one or more schedule intervals;
- `in_progress` - work has started;
- `completed` - work is finished;
- `cancelled` - cancelled and its occupied intervals are released;
- `expired` - a pending public hold elapsed and its future capacity was released;
- `no_show` - the customer did not attend.

Service and vehicle configuration determine duration on the server. Package reservations use the package duration rather than adding package items. Work is continuous on one bay during open hours; if it does not fit before closing, it resumes on that same bay at the next open period. The editor shows the complete affected work plan and completion time before saving. The database creates all daily segments atomically, rejects overlapping half-open time ranges, and keeps history when cancellation, expiry or `no_show` releases future capacity.

`completed` does not silently free future segments. Use **Complete and release remaining time** and confirm the warning only when the work has ended early. Admin-created sources can be recorded as admin, phone or walk-in; public website origin is preserved on later edits.

Internal notes may contain operational information only. Do not enter passwords, payment-card data, medical information, or unrelated personal data. Sign out on shared devices and deactivate both the Auth user and admin profile if an account is compromised.
