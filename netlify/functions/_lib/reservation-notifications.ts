import type { BookingLanguage } from '../../../src/shared/contracts'
import { sendResendEmail } from './notifications'
import type { SupabaseServer } from './supabase'

type OutboxRow = {
  id: string
  reservation_id: string
  event_type: string
  audience: 'customer' | 'admin'
  recipient: string | null
  language: BookingLanguage
  status: string
  attempt_count: number
  channel?: 'email' | 'telegram'
}

type ReservationRow = {
  id: string
  reference: string
  status: string
  starts_at: string | null
  ends_at: string | null
  estimated_total_min_cents: number | null
  estimated_total_max_cents: number | null
  estimated_total_cents: number
  language: BookingLanguage
  customer_id: string
  vehicle_id: string
}

type NotificationConfig = {
  mode: 'disabled' | 'test' | 'live'
  apiKey?: string
  fromEmail?: string
  ownerEmail?: string
  testRecipient?: string
}

type Copy = { subject: string; intro: string; status: string }

const eventCopy: Record<BookingLanguage, Record<string, Copy>> = {
  en: {
    booking_requested: { subject: 'VELORA request {reference} received', intro: 'Your booking request has been received and is pending review.', status: 'Pending — not yet confirmed' },
    booking_confirmed: { subject: 'VELORA booking {reference} confirmed', intro: 'Your booking has been confirmed.', status: 'Confirmed' },
    booking_rescheduled: { subject: 'VELORA booking {reference} rescheduled', intro: 'The appointment time for your booking has changed.', status: 'Rescheduled' },
    booking_reminder: { subject: 'VELORA booking {reference} reminder', intro: 'This is a reminder for your upcoming appointment.', status: 'Confirmed' },
    booking_cancelled: { subject: 'VELORA booking {reference} cancelled', intro: 'Your booking has been cancelled.', status: 'Cancelled' },
    vehicle_ready: { subject: 'Your vehicle is ready — {reference}', intro: 'The planned work is complete and your vehicle is ready.', status: 'Completed' },
    aftercare: { subject: 'VELORA aftercare — {reference}', intro: 'Follow the aftercare guidance agreed with the studio to protect the completed work.', status: 'Aftercare' },
    review_request: { subject: 'How was your VELORA visit?', intro: 'If you would like, you can share an honest review of your visit.', status: 'Completed' },
    pending_expiration: { subject: 'Pending VELORA request {reference}', intro: 'A pending reservation is approaching its hold expiration.', status: 'Admin attention' },
    scheduling_conflict: { subject: 'Scheduling conflict — {reference}', intro: 'A reservation needs manual scheduling attention.', status: 'Admin attention' },
    delivery_failure: { subject: 'Notification failure — {reference}', intro: 'A reservation notification could not be delivered.', status: 'Admin attention' },
  },
  lv: {
    booking_requested: { subject: 'VELORA pieprasījums {reference} saņemts', intro: 'Jūsu vizītes pieprasījums ir saņemts un gaida pārskatīšanu.', status: 'Gaida apstiprinājumu' },
    booking_confirmed: { subject: 'VELORA vizīte {reference} apstiprināta', intro: 'Jūsu vizīte ir apstiprināta.', status: 'Apstiprināta' },
    booking_rescheduled: { subject: 'VELORA vizīte {reference} pārcelta', intro: 'Jūsu vizītes laiks ir mainīts.', status: 'Pārcelta' },
    booking_reminder: { subject: 'Atgādinājums par VELORA vizīti {reference}', intro: 'Atgādinām par gaidāmo vizīti.', status: 'Apstiprināta' },
    booking_cancelled: { subject: 'VELORA vizīte {reference} atcelta', intro: 'Jūsu vizīte ir atcelta.', status: 'Atcelta' },
    vehicle_ready: { subject: 'Jūsu auto ir gatavs — {reference}', intro: 'Plānotie darbi ir pabeigti, un auto ir gatavs.', status: 'Pabeigta' },
    aftercare: { subject: 'VELORA kopšanas norādes — {reference}', intro: 'Ievērojiet ar studiju saskaņotās kopšanas norādes.', status: 'Kopšana' },
    review_request: { subject: 'Kā jums patika VELORA apmeklējums?', intro: 'Ja vēlaties, dalieties ar godīgu atsauksmi par apmeklējumu.', status: 'Pabeigta' },
    pending_expiration: { subject: 'Gaidošs VELORA pieprasījums {reference}', intro: 'Rezervācijas laika turējums drīz beigsies.', status: 'Administratora uzmanība' },
    scheduling_conflict: { subject: 'Grafika konflikts — {reference}', intro: 'Rezervācijai nepieciešama manuāla plānošana.', status: 'Administratora uzmanība' },
    delivery_failure: { subject: 'Paziņojuma kļūda — {reference}', intro: 'Rezervācijas paziņojumu neizdevās nosūtīt.', status: 'Administratora uzmanība' },
  },
  ru: {
    booking_requested: { subject: 'Запрос VELORA {reference} получен', intro: 'Ваш запрос на запись получен и ожидает проверки.', status: 'Ожидает подтверждения' },
    booking_confirmed: { subject: 'Запись VELORA {reference} подтверждена', intro: 'Ваша запись подтверждена.', status: 'Подтверждено' },
    booking_rescheduled: { subject: 'Запись VELORA {reference} перенесена', intro: 'Время вашей записи изменено.', status: 'Перенесено' },
    booking_reminder: { subject: 'Напоминание VELORA {reference}', intro: 'Напоминаем о предстоящем визите.', status: 'Подтверждено' },
    booking_cancelled: { subject: 'Запись VELORA {reference} отменена', intro: 'Ваша запись отменена.', status: 'Отменено' },
    vehicle_ready: { subject: 'Ваш автомобиль готов — {reference}', intro: 'Запланированные работы завершены, автомобиль готов.', status: 'Завершено' },
    aftercare: { subject: 'Рекомендации VELORA — {reference}', intro: 'Следуйте рекомендациям по уходу, согласованным со студией.', status: 'Уход' },
    review_request: { subject: 'Как прошёл ваш визит в VELORA?', intro: 'При желании поделитесь честным отзывом о визите.', status: 'Завершено' },
    pending_expiration: { subject: 'Ожидающий запрос VELORA {reference}', intro: 'Срок удержания времени по запросу скоро истечёт.', status: 'Требует внимания' },
    scheduling_conflict: { subject: 'Конфликт расписания — {reference}', intro: 'Запись требует ручной проверки расписания.', status: 'Требует внимания' },
    delivery_failure: { subject: 'Ошибка уведомления — {reference}', intro: 'Уведомление по записи не удалось доставить.', status: 'Требует внимания' },
  },
}

function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function loadModel(db: SupabaseServer, reservationId: string) {
  const reservations = await db.request<ReservationRow[]>(`/rest/v1/reservations?id=eq.${reservationId}&select=id,reference,status,starts_at,ends_at,estimated_total_min_cents,estimated_total_max_cents,estimated_total_cents,language,customer_id,vehicle_id&limit=1`)
  const reservation = reservations[0]
  if (!reservation) throw new Error('NOTIFICATION_RESERVATION_MISSING')
  const [customers, vehicles, items, business] = await Promise.all([
    db.request<Array<{ full_name: string; phone: string; email: string | null }>>(`/rest/v1/customers?id=eq.${reservation.customer_id}&select=full_name,phone,email&limit=1`),
    db.request<Array<{ make_model: string }>>(`/rest/v1/vehicles?id=eq.${reservation.vehicle_id}&select=make_model&limit=1`),
    db.request<Array<{ service_name_snapshot: string }>>(`/rest/v1/reservation_services?reservation_id=eq.${reservation.id}&select=service_name_snapshot&order=created_at.asc`),
    db.request<Array<{ public_business_name: string; review_url: string | null }>>('/rest/v1/business_configuration?singleton=eq.true&select=public_business_name,review_url&limit=1'),
  ])
  return { reservation, customer: customers[0], vehicle: vehicles[0], items, business: business[0] }
}

function render(input: Awaited<ReturnType<typeof loadModel>>, outbox: OutboxRow) {
  const language = outbox.audience === 'admin' ? 'en' : outbox.language
  const copy = eventCopy[language][outbox.event_type] ?? eventCopy[language].delivery_failure
  const locale = language === 'lv' ? 'lv-LV' : language === 'ru' ? 'ru-LV' : 'en-LV'
  const subject = copy.subject.replace('{reference}', input.reservation.reference)
  const schedule = input.reservation.starts_at
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Riga' }).format(new Date(input.reservation.starts_at))
    : 'Not scheduled'
  const min = input.reservation.estimated_total_min_cents ?? input.reservation.estimated_total_cents
  const max = input.reservation.estimated_total_max_cents ?? min
  const estimate = min === max
    ? new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(min / 100)
    : `${new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(min / 100)}–${new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(max / 100)}`
  const details = [
    `Reference: ${input.reservation.reference}`,
    `Status: ${copy.status}`,
    `Appointment: ${schedule}`,
    `Vehicle: ${input.vehicle?.make_model ?? ''}`,
    `Services: ${input.items.map((item) => item.service_name_snapshot).join(', ')}`,
    `Estimate: ${estimate}`,
  ]
  if (outbox.audience === 'admin' && input.customer) {
    details.push(`Customer: ${input.customer.full_name}`, `Phone: ${input.customer.phone}`, `Email: ${input.customer.email ?? ''}`)
  }
  if (outbox.event_type === 'review_request' && input.business?.review_url) details.push(`Review: ${input.business.review_url}`)
  const text = [copy.intro, '', ...details].join('\n')
  const html = `<main style="font-family:Arial,sans-serif;color:#111318"><h1>${escape(input.business?.public_business_name ?? 'VELORA Detail Lab')}</h1><p>${escape(copy.intro)}</p><ul>${details.map((line) => `<li>${escape(line)}</li>`).join('')}</ul></main>`
  return { subject, text, html }
}

async function update(db: SupabaseServer, id: string, patch: Record<string, unknown>) {
  await db.request(`/rest/v1/notification_outbox?id=eq.${id}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch),
  })
}

async function queueDeliveryFailure(db: SupabaseServer, outbox: OutboxRow, reason: string) {
  if (outbox.event_type === 'delivery_failure') return
  await db.request('/rest/v1/notification_outbox?on_conflict=idempotency_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({
      reservation_id: outbox.reservation_id,
      event_type: 'delivery_failure',
      audience: 'admin',
      language: 'en',
      idempotency_key: `${outbox.id}:delivery_failure:admin`,
      payload_snapshot: { failed_event: outbox.event_type, reason: reason.slice(0, 200) },
    }),
  })
}

export async function processReservationNotifications(
  db: SupabaseServer,
  config: NotificationConfig,
  reservationId: string | null = null,
  fetcher: typeof fetch = fetch,
): Promise<{ sent: number; failed: number; suppressed: number }> {
  const rows = await db.request<OutboxRow[]>('/rest/v1/rpc/claim_notification_outbox_channel', {
    method: 'POST', body: JSON.stringify({ p_channel: 'email', p_reservation_id: reservationId, p_limit: reservationId ? 10 : 25 }),
  })
  const outcome = { sent: 0, failed: 0, suppressed: 0 }
  for (const outbox of rows) {
    try {
      const model = await loadModel(db, outbox.reservation_id)
      const intendedRecipient = outbox.audience === 'admin' ? config.ownerEmail : model.customer?.email
      if (config.mode !== 'live') {
        await update(db, outbox.id, { status: 'suppressed', provider: config.mode === 'test' ? 'test' : null, last_error: config.mode === 'test' ? 'test_mode_no_delivery' : 'notification_provider_disabled' })
        outcome.suppressed += 1
        continue
      }
      if (!config.apiKey || !config.fromEmail || !intendedRecipient) {
        await update(db, outbox.id, { status: 'failed', last_error: 'notification_provider_not_configured', next_attempt_at: new Date(Date.now() + 3_600_000).toISOString() })
        await queueDeliveryFailure(db, outbox, 'notification_provider_not_configured').catch(() => undefined)
        outcome.failed += 1
        continue
      }
      const recipient = config.testRecipient || intendedRecipient
      const providerReference = await sendResendEmail(config.apiKey, {
        from: config.fromEmail,
        to: [recipient],
        ...render(model, outbox),
      }, fetcher)
      await update(db, outbox.id, { status: 'sent', provider: 'resend', provider_reference: providerReference, sent_at: new Date().toISOString(), last_error: null })
      outcome.sent += 1
    } catch (error) {
      const waitMinutes = Math.min(360, 5 * 2 ** Math.max(0, outbox.attempt_count - 1))
      await update(db, outbox.id, {
        status: 'failed',
        last_error: error instanceof Error ? error.message.slice(0, 500) : 'notification_delivery_failed',
        next_attempt_at: new Date(Date.now() + waitMinutes * 60_000).toISOString(),
      })
      await queueDeliveryFailure(db, outbox, error instanceof Error ? error.message : 'notification_delivery_failed').catch(() => undefined)
      outcome.failed += 1
    }
  }
  return outcome
}
