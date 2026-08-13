# Security and privacy review

## Trust model

Customer input, URLs, Auth tokens and provider responses are untrusted. Netlify Functions enforce origin, method, body size, normalization, maximum lengths, catalog existence, consent version and server-side price/duration. PostgreSQL is the final authority for idempotency, transaction integrity and schedule conflicts.

The browser receives only:

- the public Supabase URL and anon key for administrator sign-in;
- an optional Turnstile site key;
- sanitized availability, booking and admin responses.

Server-only secrets:

- Supabase service-role key;
- rate-limit signing secret;
- optional Turnstile secret.

## Threat controls

| Threat | Control | Residual risk |
|---|---|---|
| Price tampering | Browser totals are ignored; the active database catalog is recalculated server-side | Incorrect catalog configuration can still produce an incorrect estimate |
| Double booking | Transactional RPC plus GiST exclusion constraint for confirmed/in-progress work | Requests with status `new` do not reserve capacity until confirmed |
| Duplicate retry | Unique idempotency key plus submit locking | A new idempotency key can create another request; rate limits reduce abuse |
| Spam | Honeypot, atomic HMAC rate limits, maximum lengths and optional Turnstile | Distributed abuse may require additional edge controls |
| Admin impersonation | Supabase Auth token plus active server-side admin profile | A successful same-origin XSS could access a browser-held token |
| Data leakage through logs | Structured allow-list logger; no PII, body, token or authorization header | Netlify and Supabase platform metadata must still be reviewed |
| Database exposure | RLS on exposed tables; no public policies; public grants revoked | Service-role compromise has broad impact |
| CSV misuse | Authenticated admin-only export | Downloaded CSV files contain personal data and require local handling controls |

## Administrator sessions

The admin app uses Supabase Auth and keeps the session in `sessionStorage`, not `localStorage`. Every protected API call revalidates the access token and checks `admin_profiles.is_active`. No shared or hard-coded administrator password exists.

`sessionStorage` is not equivalent to an HttpOnly cookie. The restrictive CSP, limited external scripts and React escaping reduce XSS risk; a future dedicated admin origin with a hardened cookie/BFF session would reduce token exposure further.

## Content Security Policy

The policy permits:

- same-origin Vite/React scripts, styles, fonts, images and API calls;
- the exact existing Supabase project origin for Auth requests;
- local data-URI fonts/images used by the site;
- optional Cloudflare Turnstile script, frame and connection endpoints.

It denies objects, framing, camera, geolocation and microphone. `unsafe-inline` remains for existing inline styles/scripts and should be replaced with nonces or hashes in a future hardening pass. Google Forms is no longer allowed because production bookings use the Netlify function.

## Privacy launch blockers

The data-controller identity, privacy contact, deletion-request method, retention period and final legal basis are intentionally unconfigured. The owner must approve Netlify and Supabase as processors before handling real customer data.

No company address, phone number, email address, Instagram URL or legal identity was invented. These values remain clearly marked configuration tasks. Obtain appropriate Latvian/EU legal review before processing live customer data.

## Incident response

1. Disable the booking endpoint or switch the site to demo mode if safe booking cannot be guaranteed.
2. Revoke and rotate affected keys in Supabase, Netlify and Turnstile.
3. Review sanitized function logs and `booking_history` using correlation IDs.
4. Preserve required evidence without copying customer data into GitHub.
5. Notify affected parties or regulators according to the approved incident procedure.
6. Patch and verify in a Deploy Preview before restoring the production API.
