import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTelegramSessionToken, validateTelegramInitData, verifyTelegramSessionToken } from './telegram-auth'

const botToken = '123456789:abcdefghijklmnopqrstuvwxyzABCDE'
const now = new Date('2030-01-02T12:00:00.000Z')

function signedInitData(overrides: Record<string, string> = {}) {
  const values = {
    auth_date: String(Math.floor(now.getTime() / 1000)),
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify({ id: 279058397, first_name: 'Ricards', username: 'velora_test', language_code: 'lv', allows_write_to_pm: true }),
    ...overrides,
  }
  const check = Object.entries(values).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const hash = createHmac('sha256', secret).update(check).digest('hex')
  return new URLSearchParams({ ...values, hash }).toString()
}

describe('Telegram init data validation', () => {
  it('accepts a fresh, correctly signed identity', async () => {
    await expect(validateTelegramInitData(signedInitData(), botToken, 3600, now)).resolves.toMatchObject({
      userId: '279058397', firstName: 'Ricards', languageCode: 'lv', allowsWriteToPm: true,
    })
  })

  it('rejects tampering and stale authentication', async () => {
    const tampered = signedInitData().replace('Ricards', 'Attacker')
    await expect(validateTelegramInitData(tampered, botToken, 3600, now)).rejects.toThrow('TELEGRAM_AUTH_INVALID')
    await expect(validateTelegramInitData(signedInitData({ auth_date: String(Math.floor(now.getTime() / 1000) - 3601) }), botToken, 3600, now)).rejects.toThrow('TELEGRAM_AUTH_EXPIRED')
  })
})

describe('Telegram session', () => {
  it('round-trips and expires a signed server session', async () => {
    const secret = 'a-very-long-random-session-secret-for-tests-only'
    const session = await createTelegramSessionToken('279058397', secret, 600, now)
    await expect(verifyTelegramSessionToken(session.token, secret, now)).resolves.toBe('279058397')
    await expect(verifyTelegramSessionToken(session.token, secret, new Date(now.getTime() + 601_000))).rejects.toThrow('TELEGRAM_SESSION_EXPIRED')
  })
})
