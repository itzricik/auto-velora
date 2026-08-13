import { accessToken } from './auth'
import type { AdminIdentity, OccupiedSlot, Reservation, ReservationInput, Service, VehicleCategory } from './types'

export class AdminApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken()
  if (!token) throw new AdminApiError('UNAUTHENTICATED', 401)
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...Object.fromEntries(new Headers(init.headers)),
    },
  })
  const result = await response.json().catch(() => ({})) as { error?: { code?: string } }
  if (!response.ok) throw new AdminApiError(result.error?.code ?? 'ADMIN_API_ERROR', response.status)
  return result as T
}

export function loadSchedule(date: string) {
  return request<{
    identity: AdminIdentity
    slots: OccupiedSlot[]
    services: Service[]
    vehicleCategories: VehicleCategory[]
  }>(`/api/schedule?date=${encodeURIComponent(date)}`)
}

export function loadRequests(search = '') {
  return request<{ identity: AdminIdentity; requests: Reservation[] }>(`/api/requests?search=${encodeURIComponent(search)}`)
}

export function loadReservation(id: string) {
  return request<{ reservation: Reservation }>(`/api/reservation?id=${encodeURIComponent(id)}`)
}

export function saveReservation(input: ReservationInput) {
  return request<{ reservationId: string; reference: string; status: string }>('/api/reservation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'save', ...input }),
  })
}

export function blockSlots(input: { slotDate: string; startTime: string; durationSlots: number; reason: string }) {
  return request<{ blocked: boolean }>('/api/reservation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'block', ...input }),
  })
}

export function unblockSlot(slotId: string) {
  return request<{ unblocked: boolean }>('/api/reservation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'unblock', slotId }),
  })
}
