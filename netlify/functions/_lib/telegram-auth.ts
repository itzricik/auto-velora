import type { TelegramIdentity } from '../../../src/shared/telegram'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const binary = [...bytes].map((byte) => String.fromCharCode(byte)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

async function hmac(key: Uint8Array, value: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value)))
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let mismatch = left.length ^ right.length
  const size = Math.max(left.length, right.length)
  for (let index = 0; index < size; index += 1) mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0)
  return mismatch === 0
}

function safeText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized && normalized.length <= maximum ? normalized : undefined
}

export async function validateTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number,
  now = new Date(),
): Promise<TelegramIdentity> {
  if (!initData || initData.length > 8_192 || botToken.length < 20) throw new Error('TELEGRAM_AUTH_INVALID')
  const params = new URLSearchParams(initData)
  const unique = new Map<string, string>()
  for (const [key, value] of params) {
    if (unique.has(key)) throw new Error('TELEGRAM_AUTH_INVALID')
    unique.set(key, value)
  }
  const receivedHash = unique.get('hash')
  if (!receivedHash || !/^[0-9a-f]{64}$/i.test(receivedHash)) throw new Error('TELEGRAM_AUTH_INVALID')
  const dataCheckString = [...unique.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secretKey = await hmac(encoder.encode('WebAppData'), botToken)
  const expectedHash = await hmac(secretKey, dataCheckString)
  const receivedBytes = Uint8Array.from(receivedHash.match(/.{2}/g) ?? [], (value) => Number.parseInt(value, 16))
  if (!constantTimeEqual(expectedHash, receivedBytes)) throw new Error('TELEGRAM_AUTH_INVALID')

  const authDate = Number(unique.get('auth_date'))
  const currentSeconds = Math.floor(now.getTime() / 1000)
  if (!Number.isSafeInteger(authDate)
    || authDate > currentSeconds + 60
    || authDate < currentSeconds - maxAgeSeconds) throw new Error('TELEGRAM_AUTH_EXPIRED')

  let user: Record<string, unknown>
  try {
    user = JSON.parse(unique.get('user') ?? '') as Record<string, unknown>
  } catch {
    throw new Error('TELEGRAM_AUTH_INVALID')
  }
  const numericId = typeof user.id === 'number' ? user.id : Number.NaN
  const firstName = safeText(user.first_name, 100)
  if (!Number.isSafeInteger(numericId) || numericId <= 0 || !firstName) throw new Error('TELEGRAM_AUTH_INVALID')
  const photoUrl = safeText(user.photo_url, 2_048)
  return {
    userId: String(numericId),
    username: safeText(user.username, 64),
    firstName,
    lastName: safeText(user.last_name, 100),
    languageCode: safeText(user.language_code, 16),
    photoUrl: photoUrl?.startsWith('https://') ? photoUrl : undefined,
    allowsWriteToPm: user.allows_write_to_pm === true,
    authDate,
    startParam: safeText(unique.get('start_param'), 128),
  }
}

type SessionPayload = { v: 1; sub: string; iat: number; exp: number }

async function sessionSignature(payload: string, secret: string): Promise<Uint8Array> {
  if (secret.length < 32) throw new Error('CONFIG_TELEGRAM_SESSION_SECRET')
  return hmac(encoder.encode(secret), `velora-telegram-session:${payload}`)
}

export async function createTelegramSessionToken(
  userId: string,
  secret: string,
  ttlSeconds: number,
  now = new Date(),
): Promise<{ token: string; expiresAt: string }> {
  if (!/^\d{1,16}$/.test(userId) || ttlSeconds < 300 || ttlSeconds > 86_400) throw new Error('TELEGRAM_SESSION_INVALID')
  const issuedAt = Math.floor(now.getTime() / 1000)
  const payload: SessionPayload = { v: 1, sub: userId, iat: issuedAt, exp: issuedAt + ttlSeconds }
  const encoded = bytesToBase64Url(encoder.encode(JSON.stringify(payload)))
  const signature = bytesToBase64Url(await sessionSignature(encoded, secret))
  return { token: `${encoded}.${signature}`, expiresAt: new Date(payload.exp * 1000).toISOString() }
}

export async function verifyTelegramSessionToken(token: string, secret: string, now = new Date()): Promise<string> {
  if (!token || token.length > 1_024) throw new Error('TELEGRAM_SESSION_INVALID')
  const [encoded, signature, extra] = token.split('.')
  if (!encoded || !signature || extra) throw new Error('TELEGRAM_SESSION_INVALID')
  const signatureBytes = base64UrlToBytes(signature)
  if (!signatureBytes || !constantTimeEqual(await sessionSignature(encoded, secret), signatureBytes)) {
    throw new Error('TELEGRAM_SESSION_INVALID')
  }
  const payloadBytes = base64UrlToBytes(encoded)
  if (!payloadBytes) throw new Error('TELEGRAM_SESSION_INVALID')
  let payload: SessionPayload
  try {
    payload = JSON.parse(decoder.decode(payloadBytes)) as SessionPayload
  } catch {
    throw new Error('TELEGRAM_SESSION_INVALID')
  }
  const nowSeconds = Math.floor(now.getTime() / 1000)
  if (payload.v !== 1 || !/^\d{1,16}$/.test(payload.sub)
    || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
    || payload.iat > nowSeconds + 60 || payload.exp <= nowSeconds || payload.exp - payload.iat > 86_400) {
    throw new Error('TELEGRAM_SESSION_EXPIRED')
  }
  return payload.sub
}

export function bearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') ?? ''
  const match = authorization.match(/^Bearer ([A-Za-z0-9_.-]+)$/)
  if (!match) throw new Error('TELEGRAM_SESSION_REQUIRED')
  return match[1]
}

export function timingSafeTextEqual(left: string, right: string): boolean {
  return constantTimeEqual(encoder.encode(left), encoder.encode(right))
}

export { bytesToHex }
