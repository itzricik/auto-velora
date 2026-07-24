import { describe, expect, it, vi } from 'vitest'
import { enforceBookingRateLimits, verifyTurnstile } from './protection'
import type { SupabaseServer } from './supabase'

describe('booking abuse protection', () => {
  it('HMACs identifiers before passing them to the database', async () => {
    const request = vi.fn(async () => true)
    const allowed = await enforceBookingRateLimits({ request } as unknown as SupabaseServer, 'a-strong-test-secret', {
      ip: '192.0.2.1',
      email: 'customer@example.test',
      phone: '+37120000001',
    })

    expect(allowed).toBe(true)
    expect(request).toHaveBeenCalledTimes(3)
    for (const [, init] of request.mock.calls) {
      const body = JSON.parse(String(init?.body)) as { p_identifier_hash: string }
      expect(body.p_identifier_hash).toMatch(/^[a-f0-9]{64}$/)
      expect(String(init?.body)).not.toContain('customer@example.test')
      expect(String(init?.body)).not.toContain('192.0.2.1')
    }
  })

  it('stops on the first rejected rate-limit bucket', async () => {
    const request = vi.fn(async () => false)
    await expect(enforceBookingRateLimits({ request } as unknown as SupabaseServer, 'a-strong-test-secret', {
      ip: '192.0.2.1',
      email: 'customer@example.test',
      phone: '+37120000001',
    })).resolves.toBe(false)
    expect(request).toHaveBeenCalledOnce()
  })

  it('requires a Turnstile token only when the server secret is configured', async () => {
    await expect(verifyTurnstile(undefined, undefined, '192.0.2.1')).resolves.toBe(true)
    await expect(verifyTurnstile('configured-secret', undefined, '192.0.2.1')).resolves.toBe(false)
  })
})
