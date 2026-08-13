import { getAdminAccessToken } from './auth'

export type AdminIdentity = {
  userId: string
  role: 'admin' | 'staff'
  displayName: string
}

export type AdminBooking = {
  id: string
  reference: string
  status: string
  starts_at: string
  ends_at: string
  estimated_price_cents: number
  estimated_duration_minutes: number
  final_price_cents: number | null
  vehicle_description: string
  customer_notes: string | null
  internal_notes: string | null
  booking_language: 'en' | 'lv' | 'ru'
  customers: {
    full_name: string
    normalized_email: string
    normalized_phone: string
  } | Array<{
    full_name: string
    normalized_email: string
    normalized_phone: string
  }>
  booking_services: Array<{
    service_name_snapshot: string
    unit_price_cents_snapshot: number
    duration_minutes_snapshot: number
  }>
  booking_status_history?: Array<{
    previous_status: string | null
    new_status: string
    change_source: string
    note: string | null
    created_at: string
  }>
}

export type AdminSummary = {
  today: number
  tomorrow: number
  upcoming: number
  new: number
  confirmed: number
  cancelled: number
}

async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAdminAccessToken()
  if (!token) throw new Error('ADMIN_UNAUTHENTICATED')
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...Object.fromEntries(new Headers(init.headers)),
    },
  })
  const result = await response.json().catch(() => ({})) as { error?: { code?: string } }
  if (!response.ok) throw new Error(result.error?.code ?? 'ADMIN_API_ERROR')
  return result as T
}

export async function listBookings(query: {
  search?: string
  status?: string
  from?: string
  to?: string
  page?: number
}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  return adminRequest<{
    bookings: AdminBooking[]
    hasMore: boolean
    page: number
    summary: AdminSummary
    identity: AdminIdentity
  }>(`/api/admin-bookings?${params}`)
}

export async function getBooking(id: string) {
  return adminRequest<{ booking: AdminBooking; identity: AdminIdentity }>(`/api/admin-bookings?id=${encodeURIComponent(id)}`)
}

export async function updateBooking(input: {
  bookingId: string
  status?: string
  startsAt?: string
  endsAt?: string
  internalNotes?: string
  finalPriceCents?: number
  note?: string
}) {
  return adminRequest<{ booking: AdminBooking }>('/api/admin-booking-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function downloadBookingsCsv(query: { search?: string; status?: string; from?: string; to?: string }) {
  const token = await getAdminAccessToken()
  if (!token) throw new Error('ADMIN_UNAUTHENTICATED')
  const params = new URLSearchParams({ export: 'csv' })
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value)
  const response = await fetch(`/api/admin-bookings?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error('CSV_EXPORT_FAILED')
  return response.blob()
}

export type AdminBlock = {
  id: string
  work_bay_id: string | null
  starts_at: string
  ends_at: string
  reason: string
}

export async function loadBlocks() {
  return adminRequest<{
    blocks: AdminBlock[]
    bays: Array<{ id: string; code: string; name: string; is_active: boolean }>
    hours: Array<{ weekday: number; opens_at: string | null; closes_at: string | null; is_closed: boolean }>
  }>('/api/admin-blocks')
}

export async function addBlock(input: { workBayId: string | null; startsAt: string; endsAt: string; reason: string }) {
  return adminRequest<{ block: AdminBlock }>('/api/admin-blocks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function removeBlock(id: string) {
  return adminRequest<{ deleted: boolean }>(`/api/admin-blocks?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}
