# VELORA Detail Lab

Production website for a fictional premium automotive detailing studio in Riga. It uses React, TypeScript, Vite, Lucide icons and hand-authored CSS.

Production URL: <https://auto-velora.netlify.app/>

## Local setup

Requirements: Node.js 20 or newer and npm.

```bash
npm install
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
- consent policy version;
- pricing version;
- Google Forms action and field mappings.

Unknown values are `null` in configuration and render as clearly marked required configuration. Do not replace them with invented contact details.

No environment variables or secrets are currently used, so there is no `.env.example`.

## Pricing

`src/pricing.ts` is the source of truth for service prices, durations, vehicle multipliers, package prices, package service selections and pricing calculations. The estimator and booking summary both use `calculateEstimate`.

Prices shown in the browser are non-authoritative client-side estimates. The studio must inspect the vehicle and separately confirm the final scope and price.

## Booking request behavior

The form is a booking request, not an automatic reservation system.

After validation, the browser attempts a `no-cors` POST to Google Forms. A resolved browser request cannot prove that Google accepted or stored the response. The interface therefore:

- keeps the request pending until separate confirmation;
- generates a `VEL-YYYY-XXXXXXXX` reference for follow-up;
- states that the reference is not proof of receipt;
- prevents repeated identical submissions in the current browser session;
- offers an email fallback only when a booking email is configured.

There is no server-side availability check, authoritative price calculation or double-booking prevention yet.

## Google Forms setup

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

The privacy modal explains the collected data, purpose, Google Forms/Sheets processing, intended legal basis, deletion requests, pending booking status and consent version.

Before commercial launch, the owner must confirm the final controller identity, legal basis, privacy contact and retention period, and obtain appropriate legal review. Google Forms and Google Sheets remain third-party processors in the temporary flow.

## Netlify

`netlify.toml` configures:

- build command: `npm run build`;
- publish directory: `dist`;
- SPA fallback to `index.html`;
- CSP, frame, referrer, MIME-sniffing and browser permissions headers.

In Netlify, confirm that the production branch remains `main` until the upgrade is reviewed and intentionally merged. Do not deploy `professional-upgrade` to production during Phase 1.

## Current limitations and future migration

Google Forms is temporary. It does not provide:

- a trustworthy application-level delivery acknowledgement;
- server-side validation;
- availability locking or double-booking prevention;
- authenticated staff workflows;
- controlled retention automation;
- audit logs or reliable status transitions.

The recommended next phase is a server-controlled reservation API with a database, transactional availability checks, server-side validation, rate limiting, consent/audit records, staff status management and verified customer notifications. Client-submitted estimates must be recalculated on that server.

## Images and stale artifacts

The responsive WebP automotive images in `public/images/` were generated for this fictional portfolio project.

The local archive `outputs/velora-detail-lab-netlify.zip` predates this stabilization work, is excluded from Git and must not be used for deployment. Netlify should build from the repository instead.
