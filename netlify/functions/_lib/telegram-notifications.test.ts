import { describe, expect, it, vi } from 'vitest'
import { processTelegramNotifications } from './telegram-notifications'
import type { SupabaseServer } from './supabase'

function database() {
  const patches: Array<Record<string, unknown>> = []
  const db: SupabaseServer = { request: vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/rest/v1/rpc/claim_notification_outbox_channel') {
      expect(JSON.parse(String(init?.body))).toMatchObject({ p_channel: 'telegram' })
      return [{ id: 'outbox-id', reservation_id: 'reservation-id', event_type: 'booking_confirmed', recipient: '279058397', language: 'en', attempt_count: 1 }]
    }
    if (path.startsWith('/rest/v1/reservations?')) return [{ reference: 'VEL-2030-ABCDEFGH', starts_at: '2030-01-02T09:00:00.000Z' }]
    if (path.startsWith('/rest/v1/notification_outbox?id=')) { patches.push(JSON.parse(String(init?.body))); return null }
    throw new Error(`Unexpected ${path}`)
  }) as SupabaseServer['request'] }
  return { db, patches }
}

describe('Telegram notification channel', () => {
  it('suppresses delivery safely when disabled', async () => {
    const model = database()
    const fetcher = vi.fn<typeof fetch>()
    await expect(processTelegramNotifications(model.db, { mode: 'disabled' }, null, fetcher)).resolves.toEqual({ sent: 0, failed: 0, suppressed: 1 })
    expect(fetcher).not.toHaveBeenCalled()
    expect(model.patches[0]).toMatchObject({ status: 'suppressed', last_error: 'telegram_provider_disabled' })
  })

  it('uses the Bot API only in live mode and records the provider reference', async () => {
    const model = database()
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { message_id: 44 } }), { status: 200 }))
    await expect(processTelegramNotifications(model.db, { mode: 'live', botToken: '123456789:abcdefghijklmnopqrstuvwxyzABCDE' }, null, fetcher)).resolves.toEqual({ sent: 1, failed: 0, suppressed: 0 })
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('api.telegram.org/bot'), expect.objectContaining({ method: 'POST' }))
    expect(model.patches[0]).toMatchObject({ status: 'sent', provider: 'telegram', provider_reference: '44' })
  })
})
