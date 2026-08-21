import type { BookingLanguage, BookingStatus } from '../../../src/shared/contracts'
import { renderBookingEmail, renderOwnerEmail, type BookingEmailModel } from './email-templates'
import { createNotificationLog, updateNotificationLog } from './repository'
import type { SupabaseServer } from './supabase'

type NotificationConfig = {
  apiKey?: string
  fromEmail?: string
  ownerEmail?: string
}

type NotificationInput = {
  bookingId: string
  customerEmail: string
  reference: string
  status: BookingStatus
  start: string
  end: string
  services: string[]
  vehicle: string
  estimatedPriceCents: number
  managementUrl: string
  language: BookingLanguage
  event: 'created' | 'confirmed' | 'rescheduled' | 'cancelled' | 'completed'
}

type EmailPayload = {
  from: string
  to: string[]
  subject: string
  html: string
  text: string
}

export async function sendResendEmail(
  apiKey: string,
  payload: EmailPayload,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const response = await fetcher('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const result = await response.json().catch(() => ({})) as { id?: string }
  if (!response.ok || !result.id) throw new Error(`RESEND_HTTP_${response.status}`)
  return result.id
}

async function deliverOne(
  db: SupabaseServer,
  config: Required<NotificationConfig>,
  input: NotificationInput,
  recipient: string,
  audience: 'customer' | 'owner',
  fetcher: typeof fetch,
): Promise<boolean> {
  const logId = await createNotificationLog(db, {
    bookingId: input.bookingId,
    type: `${input.event}_${audience}`,
    recipient,
  })
  const model: BookingEmailModel = input
  const template = audience === 'customer' ? renderBookingEmail(model) : renderOwnerEmail(model)
  try {
    const providerId = await sendResendEmail(config.apiKey, {
      from: config.fromEmail,
      to: [recipient],
      ...template,
    }, fetcher)
    await updateNotificationLog(db, logId, { status: 'sent', providerMessageId: providerId })
    return true
  } catch (error) {
    const code = error instanceof Error && /^RESEND_HTTP_\d+$/.test(error.message)
      ? error.message
      : 'RESEND_DELIVERY_FAILED'
    await updateNotificationLog(db, logId, { status: 'failed', errorCode: code })
    return false
  }
}

export async function sendBookingNotifications(
  db: SupabaseServer,
  config: NotificationConfig,
  input: NotificationInput,
  fetcher: typeof fetch = fetch,
): Promise<'sent' | 'failed' | 'not_configured'> {
  if (!config.apiKey || !config.fromEmail || !config.ownerEmail) return 'not_configured'
  const complete = config as Required<NotificationConfig>
  const results = await Promise.all([
    deliverOne(db, complete, input, input.customerEmail, 'customer', fetcher),
    deliverOne(db, complete, input, complete.ownerEmail, 'owner', fetcher),
  ])
  return results.every(Boolean) ? 'sent' : 'failed'
}
