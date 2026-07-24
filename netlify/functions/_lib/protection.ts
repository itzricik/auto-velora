import { hashRateLimitIdentifier } from '../../../src/shared/security'
import { checkRateLimit } from './repository'
import type { SupabaseServer } from './supabase'

export function clientIp(request: Request): string {
  const value = request.headers.get('x-nf-client-connection-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]
    ?? 'unknown'
  return value.trim().toLowerCase().slice(0, 128)
}

export async function enforceBookingRateLimits(
  db: SupabaseServer,
  secret: string,
  input: { ip: string; email: string; phone: string },
): Promise<boolean> {
  const checks = [
    { value: `ip:${input.ip}`, scope: 'booking_ip', limit: 10, seconds: 600 },
    { value: `email:${input.email}`, scope: 'booking_email', limit: 5, seconds: 3600 },
    { value: `phone:${input.phone}`, scope: 'booking_phone', limit: 5, seconds: 3600 },
  ]

  for (const check of checks) {
    const hash = await hashRateLimitIdentifier(secret, check.value)
    if (!await checkRateLimit(db, hash, check.scope, check.limit, check.seconds)) return false
  }
  return true
}

export async function verifyTurnstile(
  secret: string | undefined,
  token: string | undefined,
  remoteIp: string,
): Promise<boolean> {
  if (!secret) return true
  if (!token) return false
  const body = new URLSearchParams({
    secret,
    response: token,
    remoteip: remoteIp,
  })
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  })
  if (!response.ok) return false
  const result = await response.json() as { success?: boolean }
  return result.success === true
}
