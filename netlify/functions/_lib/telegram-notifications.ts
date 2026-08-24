import type { BookingLanguage } from '../../../src/shared/contracts'
import type { SupabaseServer } from './supabase'
import { sendTelegramMessage } from './telegram-bot'

type TelegramNotificationConfig = {
  mode: 'disabled' | 'test' | 'live'
  botToken?: string
  testChatId?: string
}

type OutboxRow = {
  id: string
  reservation_id: string
  event_type: string
  recipient: string | null
  language: BookingLanguage
  attempt_count: number
}

const copy: Record<BookingLanguage, Record<string, string>> = {
  en: {
    booking_requested: 'Request {reference} received. We will review it and confirm the appointment.',
    booking_confirmed: 'Booking {reference} is confirmed for {schedule}.',
    booking_rescheduled: 'Booking {reference} was moved to {schedule}.',
    booking_reminder: 'Reminder: booking {reference} starts {schedule}.',
    booking_cancelled: 'Booking {reference} was cancelled.',
    vehicle_ready: 'Your vehicle is ready. Reference: {reference}.',
  },
  lv: {
    booking_requested: 'Pieprasījums {reference} saņemts. Mēs to pārskatīsim un apstiprināsim vizīti.',
    booking_confirmed: 'Vizīte {reference} apstiprināta: {schedule}.',
    booking_rescheduled: 'Vizīte {reference} pārcelta uz {schedule}.',
    booking_reminder: 'Atgādinājums: vizīte {reference} sākas {schedule}.',
    booking_cancelled: 'Vizīte {reference} ir atcelta.',
    vehicle_ready: 'Jūsu auto ir gatavs. Atsauce: {reference}.',
  },
  ru: {
    booking_requested: 'Запрос {reference} получен. Мы проверим его и подтвердим визит.',
    booking_confirmed: 'Запись {reference} подтверждена на {schedule}.',
    booking_rescheduled: 'Запись {reference} перенесена на {schedule}.',
    booking_reminder: 'Напоминание: запись {reference} начнётся {schedule}.',
    booking_cancelled: 'Запись {reference} отменена.',
    vehicle_ready: 'Ваш автомобиль готов. Номер: {reference}.',
  },
}

async function update(db: SupabaseServer, id: string, patch: Record<string, unknown>) {
  await db.request(`/rest/v1/notification_outbox?id=eq.${id}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch),
  })
}

export async function processTelegramNotifications(
  db: SupabaseServer,
  config: TelegramNotificationConfig,
  reservationId: string | null = null,
  fetcher: typeof fetch = fetch,
): Promise<{ sent: number; failed: number; suppressed: number }> {
  const rows = await db.request<OutboxRow[]>('/rest/v1/rpc/claim_notification_outbox_channel', {
    method: 'POST', body: JSON.stringify({ p_channel: 'telegram', p_reservation_id: reservationId, p_limit: reservationId ? 10 : 25 }),
  })
  const outcome = { sent: 0, failed: 0, suppressed: 0 }
  for (const outbox of rows) {
    try {
      if (config.mode === 'disabled') {
        await update(db, outbox.id, { status: 'suppressed', last_error: 'telegram_provider_disabled' })
        outcome.suppressed += 1
        continue
      }
      const reservations = await db.request<Array<{ reference: string; starts_at: string | null }>>(
        `/rest/v1/reservations?id=eq.${outbox.reservation_id}&select=reference,starts_at&limit=1`,
      )
      const reservation = reservations[0]
      const recipient = config.mode === 'test' ? config.testChatId : outbox.recipient
      if (!config.botToken || !recipient || !reservation) throw new Error('telegram_provider_not_configured')
      const locale = outbox.language === 'lv' ? 'lv-LV' : outbox.language === 'ru' ? 'ru-LV' : 'en-LV'
      const schedule = reservation.starts_at
        ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Riga' }).format(new Date(reservation.starts_at))
        : '—'
      const template = copy[outbox.language]?.[outbox.event_type] ?? copy.en[outbox.event_type] ?? 'VELORA update: {reference}.'
      const text = template.replace('{reference}', reservation.reference).replace('{schedule}', schedule)
      const providerReference = await sendTelegramMessage(config.botToken, { chatId: recipient, text }, fetcher)
      await update(db, outbox.id, { status: 'sent', provider: 'telegram', provider_reference: providerReference, sent_at: new Date().toISOString(), last_error: null })
      outcome.sent += 1
    } catch (error) {
      const waitMinutes = Math.min(360, 5 * 2 ** Math.max(0, outbox.attempt_count - 1))
      await update(db, outbox.id, {
        status: 'failed',
        last_error: error instanceof Error ? error.message.slice(0, 500) : 'telegram_delivery_failed',
        next_attempt_at: new Date(Date.now() + waitMinutes * 60_000).toISOString(),
      })
      outcome.failed += 1
    }
  }
  return outcome
}
