const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const binary = [...bytes].map((byte) => String.fromCharCode(byte)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function createSecureReference(date = new Date()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const suffix = [...bytes].map((byte) => REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]).join('')
  return `VEL-${date.getUTCFullYear()}-${suffix}`
}

export function createPublicAccessToken(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return bytesToHex(new Uint8Array(digest))
}

export async function hashPublicAccessToken(token: string): Promise<string> {
  if (token.length < 32 || token.length > 128) throw new Error('INVALID_TOKEN')
  return sha256(token)
}

export async function hashRateLimitIdentifier(secret: string, normalizedIdentifier: string): Promise<string> {
  if (secret.length < 16) throw new Error('RATE_LIMIT_SECRET_TOO_SHORT')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(normalizedIdentifier))
  return bytesToHex(new Uint8Array(signature))
}

export async function derivePublicAccessToken(secret: string, idempotencyKey: string): Promise<string> {
  if (secret.length < 16) throw new Error('ACCESS_TOKEN_SECRET_TOO_SHORT')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`booking-access:${idempotencyKey}`),
  )
  return bytesToBase64Url(new Uint8Array(signature))
}
