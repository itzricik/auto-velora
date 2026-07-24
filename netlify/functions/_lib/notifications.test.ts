import { describe, expect, it, vi } from 'vitest'
import { renderBookingEmail } from './email-templates'
import { sendBookingNotifications } from './notifications'
import type { SupabaseServer } from './supabase'

const model = {
  bookingId: '11111111-1111-4111-8111-111111111111',
  customerEmail: 'customer@example.lv',
  reference: 'VEL-2030-ABCDEFGH',
  status: 'requested' as const,
  start: '2030-01-02T07:00:00.000Z',
  end: '2030-01-02T09:00:00.000Z',
  services: ['Paint Correction'],
  vehicle: 'Volvo XC60',
  estimatedPriceCents: 24200,
  managementUrl: 'https://example.test/booking?reference=VEL-2030-ABCDEFGH&token=secret',
  language: 'lv' as const,
  event: 'created' as const,
}

function fakeDatabase() {
  let sequence = 0
  const request = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.startsWith('/rest/v1/notification_logs?')) {
      sequence += 1
      return [{ id: `log-${sequence}` }]
    }
    if (path.startsWith('/rest/v1/notification_logs?id=')
      && init?.method === 'PATCH') return {}
    return {}
  })
  return { request } as unknown as SupabaseServer
}

describe('booking notifications', () => {
  it('renders localized content without internal notes', () => {
    const email = renderBookingEmail(model)
    expect(email.subject).toContain('VEL-2030-ABCDEFGH')
    expect(email.text).toContain('Pakalpojumi')
    expect(email.text).toContain('Paint Correction')
    expect(email.text).not.toContain('internal')
  })

  it('sends and records customer and owner messages', async () => {
    const db = fakeDatabase()
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: 'resend-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch
    const result = await sendBookingNotifications(db, {
      apiKey: 'test-key',
      fromEmail: 'verified@example.test',
      ownerEmail: 'owner@example.test',
    }, model, fetcher)
    expect(result).toBe('sent')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('reports delivery failure without throwing away the booking result', async () => {
    const db = fakeDatabase()
    const fetcher = vi.fn(async () => new Response('{}', {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch
    await expect(sendBookingNotifications(db, {
      apiKey: 'test-key',
      fromEmail: 'verified@example.test',
      ownerEmail: 'owner@example.test',
    }, model, fetcher)).resolves.toBe('failed')
  })
})
