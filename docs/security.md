# Security and privacy review

## Trust model

Customer input, URLs, Auth tokens and provider responses are untrusted. Netlify Functions enforce origin, method, body size, normalization, maximum lengths, catalog existence, consent version and server-side price/duration. PostgreSQL is the final authority for idempotency and time conflicts.

The browser receives only:

- public Supabase URL and anon key for administrator sign-in;
- optional Turnstile site key;
- sanitized availability/booking/status responses.

Server-only secrets:

- Supabase service-role key;
- Resend API key;
- rate-limit/access-token derivation secret;
- Turnstile secret.

## Threat controls

| Threat | Control | Residual risk |
|---|---|---|
| Price tampering | Browser price is ignored; active DB catalog is recalculated server-side | Incorrect catalog data still produces incorrect prices |
| Double booking | Transaction + conditional GiST exclusion constraint | Manual requested slots can compete by design |
| Duplicate retry | UUID constraint + retry-stable management token + no duplicate email | A client using a new key can create another request; rate limits reduce abuse |
| Booking enumeration | Reference plus high-entropy token; only hash stored | Token in an email can be forwarded or exposed by the recipient |
| Spam | Honeypot, HMAC rate limits, submit lock, optional Turnstile | Distributed abuse may require stronger edge controls |
| Admin impersonation | Supabase Auth token plus active server-side profile | Current browser token storage remains exposed to successful same-origin XSS |
| Data leakage through logs | Structured allow-list logger; no PII/body/token/auth header | Third-party platform metadata must still be reviewed |
| Database exposure | RLS enabled; no client policies; public roles revoked | Service-role compromise has broad impact |
| Email outage | Outcome logged; booking is not rolled back | Synchronous best-effort delivery has no durable retry queue |
| CSV misuse | Authenticated admin-only export; no tokens | CSV contains personal data after download |

## Token handling

Public management tokens are derived with HMAC-SHA-256 from a strong server secret and the idempotency UUID. Only a SHA-256 hash is stored. The raw token appears in the management link returned to the customer and email; it is never logged. The management page removes credentials from the visible URL immediately after reading them.

Rotating `RATE_LIMIT_SECRET` invalidates the ability to re-derive tokens for administrator notification links and can affect idempotent retries. Plan rotation and customer-link migration before changing it.

## Administrator sessions

The admin app uses Supabase password/refresh grants and keeps the session in `sessionStorage`, not `localStorage`. The API revalidates the access token with Supabase and then checks `admin_profiles.is_active`. No fake local password exists.

`sessionStorage` is not equivalent to an HttpOnly cookie. The restrictive CSP, minimized external scripts and React escaping reduce XSS risk, but a future dedicated admin origin with hardened cookie/BFF session handling would further reduce token exposure.

## CSP

The policy permits:

- same-origin Vite/React production scripts, styles, fonts and images;
- local data-URI fonts/images already used by the site;
- same-origin API connections;
- deprecated Google Forms form/connect destinations;
- optional Cloudflare Turnstile script/frame/connect.

It denies objects, framing, camera, geolocation and microphone. `unsafe-inline` remains for existing inline styles/scripts and should be replaced with nonces/hashes in a future hardening pass. Supabase is not in `connect-src` because normal production remains demo and the admin project URL is not configured; add only the exact real project origin before enabling `/admin`.

## Privacy launch blockers

The controller identity, privacy contact, deletion-request method, retention period and final legal basis are intentionally unconfigured. The owner must approve Netlify, Supabase and Resend as processors and decide whether Google Forms remains available at all.

The committed consent notice names the intended API processors but does not invent business/legal details. Obtain appropriate Latvian/EU legal review before processing real customer data.

## Incident response

1. Return public submission mode to `demo` if safe booking cannot be guaranteed.
2. Revoke/rotate affected keys in Supabase, Resend, Turnstile and Netlify.
3. Review sanitized function logs and database audit history using correlation IDs.
4. Preserve required evidence without copying customer data into GitHub.
5. Notify affected parties/regulators according to the owner's approved procedure.
6. Patch and verify in a Deploy Preview before restoring API mode.
