# Telegram Mini App setup

The public website and the Telegram Mini App are two presentation modes in the same Vite application. `/telegram` loads the official Telegram bridge on demand; every other route keeps the existing public website. Both modes call the same catalog, availability, server pricing and transactional scheduling engine.

## BotFather

1. In `@BotFather`, create or select the production bot and copy its token directly into the public Netlify project's secret environment variable `TELEGRAM_BOT_TOKEN`. Never paste it into source code, a browser variable, an issue or a build log.
2. Run `/setmenubutton`, choose the bot, enter `Open VELORA`, and use `https://autodetailing-velora.netlify.app/telegram` as the Mini App URL.
3. Run `/setdomain` and set `autodetailing-velora.netlify.app`.
4. Configure the bot commands:

   ```text
   start - Open VELORA
   book - Start a booking
   mybookings - Show linked bookings
   help - Get help
   ```

5. Do not enable public Supabase registration; Telegram customers use verified Mini App `initData`, not Supabase Auth.

## Netlify environment

Create independent random values of at least 32 characters for `TELEGRAM_SESSION_SECRET` and `TELEGRAM_WEBHOOK_SECRET`. Set these variables in the public Netlify site for all production Function scopes:

| Variable | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot API and Mini App signature validation; secret |
| `TELEGRAM_BOT_USERNAME` | Bot username without `@` |
| `TELEGRAM_MINI_APP_URL` | Exact HTTPS `/telegram` URL |
| `TELEGRAM_WEBHOOK_SECRET` | Secret header shared with Telegram |
| `TELEGRAM_SESSION_SECRET` | Signs short-lived Mini App API sessions |
| `TELEGRAM_AUTH_MAX_AGE_SECONDS` | Maximum age of signed `initData`; default `3600` |
| `TELEGRAM_SESSION_TTL_SECONDS` | API session life; default `43200`, maximum one day |
| `TELEGRAM_NOTIFICATION_MODE` | `disabled`, `test`, or `live` |
| `TELEGRAM_TEST_CHAT_ID` | Controlled chat used only in test mode |

Generate the webhook secret locally and save it in a password manager. Do not reuse the Supabase, rate-limit or session secret.

## Webhook registration

After the Netlify deployment is live, register the exact Function endpoint. Replace placeholders only in your local terminal:

```bash
curl -sS -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://autodetailing-velora.netlify.app/api/telegram/webhook","secret_token":"<WEBHOOK_SECRET>","allowed_updates":["message"]}'
```

Verify with `getWebhookInfo`. The Function rejects requests without the matching `X-Telegram-Bot-Api-Secret-Token`, stores update IDs for idempotency and never logs the token or customer payload.

## Deep links

Supported direct Mini App targets are `book`, `services`, `mybookings`, `profile`, and `service_<catalog-code>`. Unknown values fall back to the home screen. Bot inline buttons currently pass `tgStart` in the Mini App URL; Telegram direct-link `startapp` values are read from signed `initData`.

## Notification rollout

1. Keep `TELEGRAM_NOTIFICATION_MODE=disabled` during deployment.
2. Set `test` and `TELEGRAM_TEST_CHAT_ID`, submit a controlled booking, confirm that booking-request, confirmation, reschedule, reminder, cancellation and vehicle-ready messages contain no internal notes.
3. Set `live` only after the test chat is correct. Customers receive messages only after Telegram write access is granted.
4. Email and Telegram jobs are claimed separately; delivery failure on one channel does not roll back a booking or consume the other channel's job.

## Tester checklist

- Open from Telegram iOS, Android and Desktop; confirm safe-area padding, dark/light Telegram theme, Back button and Main button.
- Open `/telegram` in a normal browser; confirm it shows a safe Telegram-only explanation and the main website still works.
- Change EN/LV/RU, close and reopen, and verify every Mini App screen uses the selected language.
- Select multiple services, a new and a saved vehicle, condition and date; confirm availability matches the public site.
- Attempt price/body tampering in DevTools; confirm the returned estimate remains server-calculated.
- Submit twice with the same request; confirm one reference is returned and no duplicate reservation exists.
- Submit for the last free bay concurrently; confirm one request receives a conflict and no partial schedule remains.
- Confirm the reservation appears immediately in the existing admin schedule with source `telegram`.
- Grant bot write access; confirm the request receipt and later status updates arrive once.
- Confirm one Telegram user cannot query or edit another user's car or booking by changing an ID.

## Rollback

Rollback the frontend and Functions by publishing the previous Netlify deploy. Keep the additive database objects in place; create a forward-only migration for database corrections. Set `TELEGRAM_NOTIFICATION_MODE=disabled`, remove the bot menu button or webhook, and rotate the bot token if it may have been exposed.
