import { describe, expect, it } from 'vitest'
import { enforceOrigin, readJsonBody } from './http'

describe('function HTTP boundaries', () => {
  it('rejects cross-origin writes and allows the configured origin', () => {
    const rejected = enforceOrigin(
      new Request('https://example.net/api', { headers: { Origin: 'https://attacker.example' } }),
      'https://auto-velora.netlify.app',
    )
    const allowed = enforceOrigin(
      new Request('https://example.net/api', { headers: { Origin: 'https://auto-velora.netlify.app' } }),
      'https://auto-velora.netlify.app',
    )
    expect(rejected?.status).toBe(403)
    expect(allowed).toBeNull()
  })

  it('enforces JSON and body-size limits', async () => {
    await expect(readJsonBody(new Request('https://example.net', {
      method: 'POST',
      body: '{not-json}',
    }))).rejects.toThrow('INVALID_JSON')
    await expect(readJsonBody(new Request('https://example.net', {
      method: 'POST',
      body: JSON.stringify({ value: 'x'.repeat(21_000) }),
    }))).rejects.toThrow('BODY_TOO_LARGE')
  })
})
