import { accessToken } from './auth'
import type { AdminIdentity, BusinessHours, BusinessHoursException, Reservation, ReservationInput, ScheduleBlock, SchedulePreview, ScheduleSegment, SchedulingSettings, Service, ServicePackage, VehicleCategory, WorkBay } from './types'

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
    segments: ScheduleSegment[]
    blocks: ScheduleBlock[]
    bays: WorkBay[]
    businessHours: BusinessHours[]
    exception: BusinessHoursException | null
    startIntervalMinutes: number
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

export function previewReservation(input: Pick<ReservationInput, 'reservationId' | 'vehicleCategoryId' | 'serviceIds' | 'requestedStart' | 'workBayId' | 'finalDurationMinutes'>) {
  return request<{ plan: SchedulePreview }>('/api/reservation', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'preview', ...input }),
  })
}

export function completeAndRelease(reservationId: string) {
  return request<{ released: boolean }>('/api/reservation', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'release_remaining', reservationId }),
  })
}

export function blockSlots(input: { slotDate: string; startTime: string; durationMinutes: number; workBayId: string; reason: string }) {
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
    body: JSON.stringify({ action: 'unblock', blockId: slotId }),
  })
}

export type AdminSettings = {
  bays: WorkBay[]
  businessHours: BusinessHours[]
  exceptions: BusinessHoursException[]
  services: Service[]
  packages: ServicePackage[]
  scheduling: SchedulingSettings
}
export function loadSettings() { return request<AdminSettings>('/api/settings') }
export function saveSettings(input: Record<string, unknown>) {
  return request<AdminSettings>('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
}
