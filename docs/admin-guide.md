# Administrator guide

Open `/admin` and sign in with a Supabase Auth account that has an active `admin_profiles` row. Credentials are sent directly to Supabase Auth; there is no shared fallback password.

The dashboard supports search by reference, customer, phone, email, or vehicle; date and status filters; booking details; status changes; internal notes; and booking history.

Statuses and allowed transitions:

- `new` → `contacted`, `confirmed`, or `cancelled`
- `contacted` → `confirmed` or `cancelled`
- `confirmed` → `in_progress`, `cancelled`, or `no_show`
- `in_progress` → `completed` or `cancelled`

The database rejects invalid transitions and writes status changes and note events to `booking_history`.

Internal notes may contain operational information only. Do not enter passwords, payment-card data, medical information, or unrelated personal data. Sign out on shared devices and deactivate both the Auth user and admin profile if an account is compromised.
