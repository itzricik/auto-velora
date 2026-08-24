import type { PublicReservationRequest, PublicReservationResult } from '../shared/contracts'
import type { TelegramAuthResponse, TelegramProfile } from '../shared/telegram'

export class TelegramApiError extends Error {
  constructor(public code: string, public status: number, public fields?: Record<string, string>) { super(code) }
}

async function response<T>(value: Response): Promise<T> {
  const body = await value.json().catch(() => ({})) as { error?: { code?: string; fieldErrors?: Record<string, string> } }
  if (!value.ok) throw new TelegramApiError(body.error?.code ?? 'API_ERROR', value.status, body.error?.fieldErrors)
  return body as T
}

export async function authenticateTelegram(initData: string): Promise<TelegramAuthResponse> {
  return response(await fetch('/api/telegram/auth', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ initData }),
  }))
}

export async function loadTelegramProfile(token: string): Promise<TelegramProfile> {
  const result = await response<{ profile: TelegramProfile }>(await fetch('/api/telegram/profile', {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  }))
  return result.profile
}

export async function updateTelegramProfile(token: string, body: Record<string, unknown>): Promise<TelegramProfile> {
  const result = await response<{ profile: TelegramProfile }>(await fetch('/api/telegram/profile', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  }))
  return result.profile
}

export async function createTelegramBooking(token: string, body: PublicReservationRequest & { existingVehicleId?: string }) {
  return response<PublicReservationResult & { profile: TelegramProfile }>(await fetch('/api/telegram/booking', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  }))
}
