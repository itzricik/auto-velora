# Deployment and preview checklist

No external project is configured by the code in this branch and no production deployment is authorized.

## 1. Prepare a test Supabase project

1. Create a dedicated non-production project.
2. Disable public Auth sign-up.
3. Link the CLI locally without committing project credentials.
4. Run `supabase db push --dry-run`, review, then `supabase db push`.
5. Apply `supabase/seed.sql` if it was not applied by the chosen workflow.
6. Run pgTAP and concurrency tests.
7. Verify `anon` cannot select `bookings`, `customers` or `admin_profiles`.
8. Create a test Auth user and insert its UUID into `admin_profiles`.
9. Confirm backup/restore behavior.

## 2. Prepare Resend

1. Verify the real sender domain.
2. Create a least-scope API key.
3. Select the real owner notification address.
4. Add values only to the Netlify preview environment.
5. Test requested, confirmed, rescheduled and cancelled messages in EN/LV/RU.
6. Confirm notification failures are logged without deleting bookings.

## 3. Configure a Netlify Deploy Preview

Add the variables classified in the README to the Deploy Preview context. Use the preview's exact origin for `PUBLIC_SITE_URL`. Never expose `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RATE_LIMIT_SECRET` or `TURNSTILE_SECRET_KEY` as `VITE_` variables.

Before API testing, update CSP `connect-src` with only the exact Supabase project origin required by administrator Auth. Turnstile origins are already scoped.

Keep `main` as the production branch. Do not promote or publish the feature branch.

## 4. Preview verification

- [ ] Preview commit matches the reviewed pull-request head.
- [ ] `npm ci`, lint, Vitest, build and Playwright checks pass.
- [ ] Migrations and seed apply to the test project.
- [ ] Anonymous table reads fail.
- [ ] Concurrent confirmed bookings cannot overlap.
- [ ] `/api/availability` handles hours, blocks, buffers and Riga DST.
- [ ] Server estimate overrides a tampered browser value.
- [ ] Manual mode returns `requested`, not `confirmed`.
- [ ] Automatic test mode returns confirmed only after commit.
- [ ] A lost slot returns `409` and refreshes choices.
- [ ] Repeating one idempotency key returns the original booking and sends no duplicate email.
- [ ] Reference + wrong token cannot view or cancel a booking.
- [ ] Cancellation cutoff is enforced.
- [ ] Customer/owner emails arrive and notification logs match.
- [ ] Resend outage leaves the booking intact.
- [ ] Admin without active profile receives `403`.
- [ ] Admin status/reschedule actions are audited.
- [ ] Requested confirmation rechecks availability.
- [ ] CSV requires `admin`, opens correctly in Excel and contains no secret token.
- [ ] EN/LV/RU customer booking and management text renders correctly.
- [ ] 375, 768, 1024 and 1440 px layouts have no horizontal overflow.
- [ ] Keyboard navigation, focus, reduced motion and screen-reader labels remain usable.
- [ ] Browser console has no errors or blocked required CSP resources.
- [ ] Public local/session storage contains no customer form data.
- [ ] Function logs contain no name, email, phone, notes, token or authorization header.

Use non-personal `.test` data in preview verification.

## 5. Production gate

Only after every preview item passes:

1. obtain owner approval for real contact/controller/privacy/retention values;
2. obtain privacy/legal review;
3. review the pull request and database backup;
4. set the intentional approval mode;
5. change normal `submissionMode` to `api` in a separate reviewed commit;
6. merge through the normal protected-branch process;
7. monitor the first controlled production booking.

## Rollback

- Frontend/Functions: publish the last verified Netlify deploy or a reviewed commit restoring demo mode.
- Database: do not delete history or edit an applied migration. Create a tested forward corrective migration.
- Email: disable the affected provider variables while keeping committed bookings available to administrators.
- Secrets: rotate compromised values and invalidate affected sessions/links.
- Data: restore to a separate project first, validate, then follow the approved recovery runbook.

Function logs are available in Netlify. Supabase database/Auth logs and Resend delivery logs remain external operational systems; access must be restricted and retention reviewed.
