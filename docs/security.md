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
- Telegram Bot token, webhook secret and Mini App session-signing secret.

## Threat controls

| Threat | Control | Residual risk |
|---|---|---|
| Price tampering | Browser totals are ignored; the active database catalog is recalculated server-side | Incorrect catalog configuration can still produce an incorrect estimate |
| Double booking | Transactional RPC plus a same-bay GiST exclusion constraint on half-open timestamp ranges | A conflict is returned safely; the client must refresh availability |
| Duplicate retry | Unique idempotency key plus submit locking | A new idempotency key can create another request; rate limits reduce abuse |
| Spam | Honeypot, atomic HMAC rate limits, maximum lengths and optional Turnstile | Distributed abuse may require additional edge controls |
| Admin impersonation | Supabase Auth token plus active server-side admin profile | A successful same-origin XSS could access a browser-held token |
| Data leakage through logs | Structured allow-list logger; no PII, body, token or authorization header | Netlify and Supabase platform metadata must still be reviewed |
| Database exposure | RLS on exposed tables; explicit `false` policies for browser roles; public grants revoked | Service-role compromise has broad impact |
| Private image disclosure | Private bucket, signed upload paths, object verification and five-minute admin read URLs | A copied signed URL remains usable until its short expiry |
| Notification duplication | Unique event idempotency keys plus atomic `skip locked` claims and bounded retries | Provider-side delivery after a network timeout can still be ambiguous |
| Pending holds | Configurable expiry, opportunistic expiry before planning/schedule operations, released segments and history | A dedicated scheduled expiry job can make release timing proactive even without traffic |
| Telegram identity spoofing | Server recomputes the official Mini App HMAC, rejects stale/future `auth_date`, and issues a short-lived signed session | Bot-token compromise permits impersonation and requires immediate rotation |
| Forged bot webhook | Telegram secret-token header, constant-time comparison and update-ID idempotency | Compromised webhook or bot secret must be rotated |
| Cross-account car/booking access | Telegram ID is taken only from verified auth/session; repository queries bind every object to its linked customer | Deliberate customer-account merge remains an administrator-only privacy operation |

## Administrator sessions

The separate admin app uses Supabase Auth and keeps the session in `sessionStorage`, not `localStorage`. Every protected API call revalidates the access token and checks `admin_profiles.active`. No shared or hard-coded administrator password exists.

`sessionStorage` is not equivalent to an HttpOnly cookie. The restrictive CSP, limited external scripts and React escaping reduce XSS risk; a future dedicated admin origin with a hardened cookie/BFF session would reduce token exposure further.

## Content Security Policy

The policy permits:

- same-origin Vite/React scripts, styles, fonts, images and API calls;
- HTTPS images deliberately published as case-study copies (scripts and connections remain origin-restricted);
- the exact existing Supabase project origin for Auth requests;
- local data-URI fonts/images used by the site;
- optional Cloudflare Turnstile script, frame and connection endpoints.

It denies objects, camera, geolocation and microphone. Framing is restricted to Telegram origins so Telegram Desktop can host `/telegram`; the official `telegram.org` bridge script is allowed and loaded only by that route. `unsafe-inline` remains for existing inline styles/scripts and should be replaced with nonces or hashes in a future hardening pass. Google Forms is no longer allowed because production bookings use the Netlify function.

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
