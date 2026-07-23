# VELORA Detail Lab

Production-ready single-page website for a fictional premium automotive detailing studio in Riga. The build uses React, TypeScript, Vite, Lucide icons and hand-authored CSS with no animation or UI framework.

## Run locally

```bash
pnpm install
pnpm dev
```

Quality checks:

```bash
pnpm lint
pnpm build
pnpm preview
```

The output in `dist/` is a static site and can be deployed to Netlify, Vercel, Cloudflare Pages or any static host. Configure the host to serve `index.html` at `/`.

## Before launch

Replace the clearly marked placeholder values in `src/config/site.ts`:

- booking email
- phone number
- Riga studio address
- Instagram URL
- canonical production URL

Update the matching canonical, Open Graph and LocalBusiness values in `index.html`, plus the hostname in `public/robots.txt` and `public/sitemap.xml`. Add the final business privacy policy through the existing privacy modal.

## Booking behavior

After client-side validation, the booking form posts directly to the configured Google Form. Google Forms stores each response in the linked `VELORA Booking Database` spreadsheet. The form action and entry IDs are isolated in `src/config/site.ts`; update them there if the Google Form questions are recreated. A direct email link is shown only when submission fails.

## Images

All automotive imagery was generated specifically for this fictional portfolio project with OpenAI's built-in image generation tool. The project uses optimized responsive WebP variants stored in `public/images/`. Source-resolution working copies are kept outside the production asset path in `work/imagegen-sources/`.

## Content and languages

All visible interface copy is available in English, Latvian and Russian in `src/i18n/translations.ts`. The selected language is stored in `localStorage`, with English as the fallback.
