import { getRuntimeConfig, getTelegramBotConfig } from './_lib/env'
import { apiError, json, readJsonBody, requestId } from './_lib/http'
import { createSupabaseServer } from './_lib/supabase'
import { timingSafeTextEqual } from './_lib/telegram-auth'
import { sendTelegramMessage } from './_lib/telegram-bot'
import { loadTelegramProfile, setTelegramWriteAccess, updateTelegramBotDelivery, upsertTelegramProfile } from './_lib/telegram-repository'

type BotUser = { id?: number; first_name?: string; last_name?: string; username?: string; language_code?: string }
type BotMessage = {
  chat?: { id?: number }
  from?: BotUser
  text?: string
  write_access_allowed?: Record<string, unknown>
}
type BotUpdate = { update_id?: number; message?: BotMessage }

function command(value?: string): string {
  return value?.trim().split(/\s+/)[0]?.replace(/@[^\s]+$/, '').toLowerCase() ?? ''
}

export default async function handler(request: Request): Promise<Response> {
  const id = requestId()
  let updateId: number | undefined
  let db: ReturnType<typeof createSupabaseServer> | undefined
  try {
    if (request.method !== 'POST') return apiError(405, 'METHOD_NOT_ALLOWED', 'Use POST.', id)
    const bot = getTelegramBotConfig()
    const suppliedSecret = request.headers.get('x-telegram-bot-api-secret-token') ?? ''
    if (!suppliedSecret || !timingSafeTextEqual(suppliedSecret, bot.webhookSecret)) {
      return apiError(401, 'TELEGRAM_WEBHOOK_UNAUTHORIZED', 'Unauthorized.', id)
    }
    const update = await readJsonBody(request) as BotUpdate
    if (!Number.isSafeInteger(update.update_id) || !update.update_id || update.update_id < 0) {
      return apiError(422, 'TELEGRAM_UPDATE_INVALID', 'Invalid update.', id)
    }
    updateId = update.update_id
    const runtime = getRuntimeConfig()
    db = createSupabaseServer(runtime.supabaseUrl, runtime.serviceRoleKey)
    const claimed = await db.request<boolean>('/rest/v1/rpc/claim_telegram_bot_update', {
      method: 'POST', body: JSON.stringify({ p_update_id: updateId }),
    })
    if (!claimed) return json({ ok: true, duplicate: true, requestId: id })

    const message = update.message
    const chatId = message?.chat?.id
    const from = message?.from
    if (!Number.isSafeInteger(chatId) || !chatId || !Number.isSafeInteger(from?.id) || !from?.id || !from.first_name) {
      await updateTelegramBotDelivery(db, updateId, 'ignored')
      return json({ ok: true, requestId: id })
    }
    const userId = String(from.id)
    await upsertTelegramProfile(db, {
      userId,
      firstName: from.first_name.slice(0, 100),
      lastName: from.last_name?.slice(0, 100),
      username: from.username?.slice(0, 64),
      languageCode: from.language_code?.slice(0, 16),
      allowsWriteToPm: Boolean(message?.write_access_allowed),
      authDate: Math.floor(Date.now() / 1000),
    })
    if (message?.write_access_allowed) await setTelegramWriteAccess(db, userId, true)

    const action = command(message?.text)
    let text = 'Use the button below to open VELORA booking.'
    let startParam = 'book'
    if (action === '/start') {
      text = 'Welcome to VELORA Detail Lab. Choose services, see live availability and manage your bookings.'
      startParam = 'home'
    } else if (action === '/help') {
      text = 'Commands: /book — new booking, /mybookings — your bookings, /help — help.'
      startParam = 'home'
    } else if (action === '/mybookings') {
      const profile = await loadTelegramProfile(db, userId)
      text = profile.bookings.length
        ? profile.bookings.slice(0, 3).map((booking) => `${booking.reference} · ${booking.status}${booking.start ? ` · ${new Intl.DateTimeFormat('en-LV', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Riga' }).format(new Date(booking.start))}` : ''}`).join('\n')
        : 'No bookings are linked to this Telegram profile yet.'
      startParam = 'mybookings'
    }
    const url = new URL(bot.miniAppUrl)
    url.searchParams.set('tgStart', startParam)
    await sendTelegramMessage(bot.botToken, { chatId: String(chatId), text, webAppUrl: url.toString(), buttonText: startParam === 'mybookings' ? 'My bookings' : 'Open VELORA' })
    await updateTelegramBotDelivery(db, updateId, 'sent')
    return json({ ok: true, requestId: id })
  } catch (error) {
    if (db && updateId !== undefined) {
      await updateTelegramBotDelivery(db, updateId, 'failed', error instanceof Error ? error.message : 'WEBHOOK_FAILED').catch(() => undefined)
    }
    const code = error instanceof Error ? error.message : 'TELEGRAM_WEBHOOK_FAILED'
    if (code === 'BODY_TOO_LARGE') return apiError(413, code, 'The request body is too large.', id)
    if (code === 'INVALID_JSON') return apiError(400, code, 'Submit valid JSON.', id)
    if (code.startsWith('CONFIG_')) return apiError(503, 'TELEGRAM_NOT_CONFIGURED', 'Telegram webhook is not configured.', id)
    return apiError(503, 'TELEGRAM_WEBHOOK_FAILED', 'Webhook processing failed.', id)
  }
}
