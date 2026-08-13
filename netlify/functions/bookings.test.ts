import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './create-booking'

function request(body: Record<string, unknown>) {
  return new Request('https://autodetailing-velora.netlify.app/api/create-booking', {
    method: 'POST',
    headers: {
      Origin: 'https://autodetailing-velora.netlify.app',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

const valid = {
  name: 'Test Customer',
  email: 'customer@example.test',
  phone: '+37120000001',
  vehicleCategoryId: '10000000-0000-4000-8000-000000000001',
  vehicleDescription: 'Test vehicle',
  serviceIds: ['20000000-0000-4000-8000-000000000001'],
  requestedStart: '2030-01-02T07:00:00.000Z',
  language: 'en',
  consentAccepted: true,
  consentPolicyVersion: '2026-08-supabase-v1',
  idempotencyKey: '30000000-0000-4000-8000-000000000001',
}

describe('public booking endpoint boundaries', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://supabase.example.test')
    vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon-key')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
    vi.stubEnv('PUBLIC_SITE_URL', 'https://autodetailing-velora.netlify.app')
    vi.stubEnv('RATE_LIMIT_SECRET', 'a-strong-test-secret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns 422 for invalid fields before contacting external services', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const response = await handler(request({}))
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'VALIDATION_FAILED' },
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects the honeypot before database access', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const response = await handler(request({ ...valid, company: 'spam company' }))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'SPAM_REJECTED' },
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns 429 when a server-side rate-limit bucket rejects the request', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('false', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    const response = await handler(request(valid))
    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'RATE_LIMITED' },
    })
  })
})
