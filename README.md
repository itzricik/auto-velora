# VELORA Detail Lab

Portfolio website for a fictional premium automotive detailing studio in Riga. It uses React, TypeScript, Vite, Lucide icons and hand-authored CSS.

Public portfolio URL: <https://auto-velora.netlify.app/>

The public booking interface currently runs only as a demonstration. Information entered into it is validated in the browser but is not sent or stored, and no real reservation is created.

## Local setup

Requirements: Node.js 20 or newer and npm.

```bash
npm ci
npm run dev
```

Quality checks:

```bash
npm run lint
npm run test
npm run build
npm run preview
```

The production output is generated in `dist/`.

## Branch workflow

- `main` is the current production source and must not receive Phase 1 work directly.
- `professional-upgrade` is based on `main` and contains reviewed stabilization work.
- `professional-upgrade-backup` permanently preserves the old unrelated branch history.

Develop and validate on `professional-upgrade`. Open a review before merging. Do not force-push or deploy `main` as part of Phase 1.

## Public configuration

All public business and policy values are centralized in `src/config/site.ts`.

The following values must be supplied by the business owner before commercial launch:

- booking email;
- phone display value;
- phone `tel:` value;
- Riga studio address;
- Instagram URL;
- privacy contact;
- data-controller identity;
- data-retention period.

The configuration also owns:

- business name;
- public website URL;
- submission mode;
- consent policy version;
- pricing version;
- Google Forms action and field mappings.

Unknown values are `null` in configuration and render as clearly marked required configuration. Do not replace them with invented contact details.

No environment variables or secrets are currently used, so there is no `.env.example`.

## Pricing

`src/pricing.ts` is the source of truth for service prices, durations, vehicle multipliers, package prices, package service selections and pricing calculations. The estimator and booking summary both use `calculateEstimate`.

Prices shown in the browser are non-authoritative client-side estimates. The studio must inspect the vehicle and separately confirm the final scope and price.

## Booking request behavior

`submissionMode` is typed as `'demo' | 'googleForms'` and defaults to `'demo'`.

In demo mode, the form:

- runs all client-side validation and pricing;
- generates a demonstration `VEL-YYYY-XXXXXXXX` reference;
- shows the selected services, estimated price and time, and preferred date;
- does not call `fetch` or the Google Forms transport;
- does not save personal data to local storage, session storage or cookies;
- clears personal form values after producing the non-personal summary;
- states that no request was transmitted, stored or converted into a real reservation.

Only the language preference is stored in `localStorage`; form values are never stored there.

The Google Forms path remains isolated in `src/booking/googleForms.ts`. If `submissionMode` is deliberately changed to `'googleForms'`, the browser attempts a `no-cors` POST after validation. A resolved request cannot prove that Google accepted or stored it, so the interface continues to describe it as pending rather than confirmed.

There is no server-side availability check, authoritative price calculation or double-booking prevention yet.

## Google Forms setup

Do not enable Google Forms for public use until a real owner has supplied every required business and privacy value, confirmed the legal basis and retention policy, reviewed the processor relationship, and approved the customer-facing privacy notice.

Temporary enablement process:

1. Complete all required values in `src/config/site.ts`.
2. Confirm the real form action, required questions and linked-sheet access.
3. Add the optional questions below and copy their actual `entry.*` IDs.
4. Obtain appropriate privacy/legal review.
5. Change `submissionMode` from `'demo'` to `'googleForms'`.
6. Validate the flow in a Netlify Deploy Preview with non-personal test data before considering a production change.

The existing form mappings in `src/config/site.ts` cover:

- customer name;
- normalized phone;
- email;
- vehicle description;
- service names;
- structured request details in the message field;
- consent record;
- language;
- preferred date.

The structured message includes the request reference, service IDs and names, vehicle category and multiplier, client-side price and duration estimates, pricing version, consent timestamp and consent policy version. This keeps the current form working without inventing unknown Google Form entry IDs.

For cleaner spreadsheet columns, manually add questions to Google Forms for the following values, then copy their real `entry.*` IDs into `googleForms.optionalFields`:

- `requestReference`;
- `serviceIds`;
- `vehicleCategory`;
- `vehicleMultiplier`;
- `estimatedPrice`;
- `estimatedDuration`;
- `pricingVersion`;
- `consentTimestamp`;
- `consentPolicyVersion`.

Missing optional mappings are intentionally `null` and do not break submission.

## Privacy

The current demo does not transmit or persist information entered into the booking form. The privacy modal explains the demo behavior and the processing that would apply only after a deliberate switch to Google Forms mode.

Before commercial launch, the owner must confirm the final controller identity, legal basis, privacy contact and retention period, and obtain appropriate legal review. Google Forms and Google Sheets remain third-party processors in the temporary flow.

## Continuous integration

`.github/workflows/ci.yml` runs on:

- pull requests targeting `main`;
- pushes to `main`;
- manual workflow dispatch.

The workflow uses Node.js 24, npm caching based on `package-lock.json`, and minimum read-only repository permissions. It runs:

```bash
npm ci
npm run lint
npm run test
npm run build
```

Any failed command fails the workflow. The workflow contains no deployment steps.

## Netlify

`netlify.toml` configures:

- build command: `npm run build`;
- publish directory: `dist`;
- SPA fallback to `index.html`;
- CSP, frame, referrer, MIME-sniffing and browser permissions headers.

In Netlify, confirm that the production branch remains `main` until the upgrade is reviewed and intentionally merged. Do not deploy `professional-upgrade` to production during Phase 1.

For review, use a Netlify Deploy Preview attached to the pull request:

1. Confirm the preview was built from the expected pull-request commit.
2. Verify the demo warning in English, Latvian and Russian.
3. Complete the form with non-personal test values and confirm the demonstration summary.
4. Confirm DevTools shows no Google Forms request and no storage of form values.
5. Check navigation, responsive layouts, accessibility and CSP console output.
6. Never promote the preview to production from this workflow.

## Current limitations and future migration

Demo mode is safe for the portfolio but is not a reservation system. Google Forms is retained only as a temporary future transport and does not provide:

- a trustworthy application-level delivery acknowledgement;
- server-side validation;
- availability locking or double-booking prevention;
- authenticated staff workflows;
- controlled retention automation;
- audit logs or reliable status transitions.

Before commercial launch, Google Forms should be replaced by a server-controlled reservation API with a database, transactional availability checks, server-side validation, rate limiting, consent/audit records, staff status management and verified customer notifications. Client-submitted estimates must be recalculated on that server.

## Images and stale artifacts

The responsive WebP automotive images in `public/images/` were generated for this fictional portfolio project.

The local archive `outputs/velora-detail-lab-netlify.zip` predates this stabilization work, is excluded from Git and must not be used for deployment. Netlify should build from the repository instead.
