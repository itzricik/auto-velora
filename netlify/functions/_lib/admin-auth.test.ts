import { describe, expect, it, vi } from 'vitest'
import { requireAdmin } from './admin-auth'
import type { SupabaseServer } from './supabase'

describe('administrator authorization', () => {
  it('rejects requests without a Supabase access token', async () => {
    await expect(requireAdmin(new Request('https://example.test/admin'), {
      supabaseUrl: 'https://supabase.example',
      anonKey: 'anon',
      db: { request: vi.fn() } as unknown as SupabaseServer,
    })).rejects.toThrow('ADMIN_UNAUTHENTICATED')
  })

  it('requires an active administrator profile', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ id: '11111111-1111-4111-8111-111111111111' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch
    const db = { request: vi.fn(async () => []) } as unknown as SupabaseServer
    try {
      await expect(requireAdmin(new Request('https://example.test/admin', {
        headers: { Authorization: 'Bearer valid-test-token' },
      }), {
        supabaseUrl: 'https://supabase.example',
        anonKey: 'anon',
        db,
      })).rejects.toThrow('ADMIN_FORBIDDEN')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
