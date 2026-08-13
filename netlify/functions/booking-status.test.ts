import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './booking-status'

describe('public booking status endpoint', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://supabase.example.test')
    vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon-key')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
    vi.stubEnv('PUBLIC_SITE_URL', 'https://auto-velora.netlify.app')
    vi.stubEnv('RATE_LIMIT_SECRET', 'a-strong-test-secret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('rejects malformed credentials without querying the database', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const response = await handler(new Request(
      'https://auto-velora.netlify.app/api/booking-status?reference=VEL-INVALID&token=short',
      { headers: { Origin: 'https://auto-velora.netlify.app' } },
    ))
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_ACCESS' },
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
