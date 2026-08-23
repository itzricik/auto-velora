import { accessToken } from './auth'
import type { AdminIdentity, BusinessConfiguration, BusinessHours, BusinessHoursException, ChecklistTemplate, ConditionRule, Reservation, ReservationInput, ScheduleBlock, SchedulePreview, ScheduleSegment, SchedulingSettings, Service, ServicePackage, VehicleCategory, WorkBay } from './types'

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
    conditionLevels: ConditionRule[]
    conditionIndicators: ConditionRule[]
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

export function previewReservation(input: Pick<ReservationInput, 'reservationId' | 'vehicleCategoryId' | 'serviceIds' | 'requestedStart' | 'workBayId' | 'finalDurationMinutes' | 'conditionLevelId' | 'conditionIndicatorIds'>) {
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
  conditionLevels: ConditionRule[]
  conditionIndicators: ConditionRule[]
  checklistTemplates: ChecklistTemplate[]
  business: BusinessConfiguration
}
export function loadSettings() { return request<AdminSettings>('/api/settings') }
export function saveSettings(input: Record<string, unknown>) {
  return request<AdminSettings>('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
}

export function updateChecklist(input: { itemId: string; completed: boolean; note: string }) {
  return request<{ item: NonNullable<Reservation['checklist']>[number] }>('/api/reservation', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'checklist', ...input }),
  })
}

export function addChecklistItem(input: { reservationId: string; label: string; required: boolean }) {
  return request<{ added: boolean }>('/api/reservation', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add_checklist_item', ...input }),
  })
}

export function removeReservationMedia(mediaId: string) {
  return request<{ removed: boolean }>('/api/reservation', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'remove_media', mediaId }),
  })
}

export function prepareAdminMedia(input: { reservationId: string; filename: string; mimeType: string; fileSize: number; mediaType: 'reference' | 'before' | 'after' }) {
  return request<{ mediaId: string; uploadUrl: string; uploadToken: string }>('/api/reservation', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'prepare_media', ...input }),
  })
}

export function finalizeAdminMedia(mediaId: string) {
  return request<{ ready: boolean }>('/api/reservation', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'finalize_media', mediaId }),
  })
}

export function uploadAdminMedia(upload: { uploadUrl: string; uploadToken: string }, file: File) {
  return new Promise<void>((resolve, reject) => {
    const url = new URL(upload.uploadUrl); if (!url.searchParams.has('token')) url.searchParams.set('token', upload.uploadToken)
    const xhr = new XMLHttpRequest(); xhr.open('POST', url.toString()); xhr.setRequestHeader('Content-Type', file.type); xhr.setRequestHeader('x-upsert', 'false')
    xhr.addEventListener('load', () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('MEDIA_UPLOAD_FAILED')))
    xhr.addEventListener('error', () => reject(new Error('MEDIA_UPLOAD_FAILED'))); xhr.send(file)
  })
}

export function loadDashboard(date: string) {
  return request<{
    todayVehicles: number
    occupiedBays: number
    freeBays: number
    pendingRequests: number
    confirmedReservations: number
    completedReservations: number
    estimatedDailyRevenueCents: number
    finalCompletedRevenueCents: number
    checklistAlerts: number
    notificationFailures: number
  }>(`/api/dashboard?date=${encodeURIComponent(date)}`)
}

export function searchHistory(search: string) {
  return request<{ reservations: Reservation[] }>(`/api/history?search=${encodeURIComponent(search)}`)
}

export type AdminContent = {
  caseStudies: Array<Record<string, unknown>>
  caseMedia: Array<Record<string, unknown>>
  reviews: Array<Record<string, unknown>>
}
export function loadContent() { return request<AdminContent>('/api/content') }
export function saveContent(input: Record<string, unknown>) { return request<AdminContent>('/api/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }) }

export function exportCustomerData(customerId: string) { return request<Record<string, unknown>>(`/api/privacy?customerId=${encodeURIComponent(customerId)}`) }
export function anonymizeCustomer(customerId: string, reason: string) { return request<{ anonymized: boolean }>('/api/privacy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'anonymize', customerId, reason }) }) }
export function mergeCustomers(sourceCustomerId: string, targetCustomerId: string) { return request<{ customerId: string }>('/api/privacy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'merge', sourceCustomerId, targetCustomerId }) }) }
export function correctCustomerVehicle(input: { reservationId: string; customerId: string; vehicleId: string; fullName: string; phone: string; email: string; customerNotes: string; registrationNumber: string; appliedProtection: string; recommendedMaintenanceDate: string; vehicleNotes: string }) { return request<{ corrected: boolean }>('/api/privacy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'correct', ...input }) }) }
