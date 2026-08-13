import type { BookingStatus } from '../../../src/shared/contracts'
import type { SupabaseServer } from './supabase'

export type AdminBooking = {
  id: string
  reference: string
  status: BookingStatus
  starts_at: string
  ends_at: string
  estimated_price_cents: number
  estimated_duration_minutes: number
  final_price_cents: number | null
  vehicle_description: string
  customer_notes: string | null
  internal_notes: string | null
  booking_language: 'en' | 'lv' | 'ru'
  idempotency_key: string
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
    previous_status: BookingStatus | null
    new_status: BookingStatus
    change_source: string
    note: string | null
    created_at: string
  }>
}

function safeSearch(value: string): string {
  return value.replace(/[^a-zA-Z0-9@+._ -]/g, '').slice(0, 100)
}

export async function listAdminBookings(
  db: SupabaseServer,
  input: {
    from?: string
    to?: string
    status?: BookingStatus
    search?: string
    page: number
    pageSize: number
    sort: 'asc' | 'desc'
  },
): Promise<{ rows: AdminBooking[]; hasMore: boolean }> {
  const filters: string[] = []
  if (input.from) filters.push(`starts_at=gte.${encodeURIComponent(input.from)}`)
  if (input.to) filters.push(`starts_at=lte.${encodeURIComponent(input.to)}`)
  if (input.status) filters.push(`status=eq.${input.status}`)
  const search = safeSearch(input.search ?? '')
  if (search) {
    const customers = await db.request<Array<{ id: string }>>(
      `/rest/v1/customers?or=${encodeURIComponent(`(full_name.ilike.*${search}*,normalized_email.ilike.*${search}*,normalized_phone.ilike.*${search}*)`)}&select=id&limit=100`,
    )
    const customerIds = customers.map((customer) => customer.id)
    const terms = [
      `reference.ilike.*${search}*`,
      `vehicle_make_model_snapshot.ilike.*${search}*`,
      ...(customerIds.length ? [`customer_id.in.(${customerIds.join(',')})`] : []),
    ]
    filters.push(`or=${encodeURIComponent(`(${terms.join(',')})`)}`)
  }
  const offset = input.page * input.pageSize
  const rows = await db.request<AdminBooking[]>(
    `/rest/v1/booking_requests?${filters.join('&')}${filters.length ? '&' : ''}select=id,reference,status,starts_at,ends_at,estimated_price_cents,estimated_duration_minutes,final_price_cents,vehicle_description:vehicle_make_model_snapshot,customer_notes,internal_notes,booking_language,idempotency_key,customers(full_name,normalized_email,normalized_phone),booking_services:booking_items(service_name_snapshot,unit_price_cents_snapshot:calculated_price_cents_snapshot,duration_minutes_snapshot)&order=starts_at.${input.sort}&offset=${offset}&limit=${input.pageSize + 1}`,
  )
  return { rows: rows.slice(0, input.pageSize), hasMore: rows.length > input.pageSize }
}

export async function getAdminBooking(db: SupabaseServer, id: string): Promise<AdminBooking | null> {
  const rows = await db.request<AdminBooking[]>(
    `/rest/v1/booking_requests?id=eq.${id}&select=id,reference,status,starts_at,ends_at,estimated_price_cents,estimated_duration_minutes,final_price_cents,vehicle_description:vehicle_make_model_snapshot,customer_notes,internal_notes,booking_language,idempotency_key,customers(full_name,normalized_email,normalized_phone),booking_services:booking_items(service_name_snapshot,unit_price_cents_snapshot:calculated_price_cents_snapshot,duration_minutes_snapshot),booking_status_history:booking_history(previous_status,new_status,change_source,note,created_at)&booking_history.order=created_at.asc&limit=1`,
  )
  return rows[0] ?? null
}

export async function getAdminSummary(db: SupabaseServer, now = new Date()) {
  const from = new Date(now)
  from.setUTCHours(0, 0, 0, 0)
  const until = new Date(from)
  until.setUTCDate(until.getUTCDate() + 31)
  const rows = await db.request<Array<{ status: BookingStatus; starts_at: string }>>(
    `/rest/v1/booking_requests?starts_at=gte.${encodeURIComponent(from.toISOString())}&starts_at=lt.${encodeURIComponent(until.toISOString())}&select=status,starts_at&limit=5000`,
  )
  const tomorrowStart = new Date(from)
  tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1)
  const dayAfterTomorrow = new Date(tomorrowStart)
  dayAfterTomorrow.setUTCDate(dayAfterTomorrow.getUTCDate() + 1)
  return {
    today: rows.filter((row) => Date.parse(row.starts_at) >= from.getTime() && Date.parse(row.starts_at) < tomorrowStart.getTime()).length,
    tomorrow: rows.filter((row) => Date.parse(row.starts_at) >= tomorrowStart.getTime() && Date.parse(row.starts_at) < dayAfterTomorrow.getTime()).length,
    upcoming: rows.filter((row) => Date.parse(row.starts_at) >= now.getTime() && row.status !== 'cancelled').length,
    new: rows.filter((row) => row.status === 'new').length,
    confirmed: rows.filter((row) => row.status === 'confirmed').length,
    cancelled: rows.filter((row) => row.status === 'cancelled').length,
  }
}

export async function adminUpdateBooking(
  db: SupabaseServer,
  input: {
    bookingId: string
    changedBy: string
    newStatus?: BookingStatus
    startsAt?: string
    endsAt?: string
    internalNotes?: string
    finalPriceCents?: number
    note?: string
  },
): Promise<AdminBooking> {
  const result = await db.request<AdminBooking | AdminBooking[]>('/rest/v1/rpc/admin_update_booking', {
    method: 'POST',
    body: JSON.stringify({
      p_booking_id: input.bookingId,
      p_changed_by: input.changedBy,
      p_new_status: input.newStatus ?? null,
      p_starts_at: input.startsAt ?? null,
      p_ends_at: input.endsAt ?? null,
      p_internal_notes: input.internalNotes ?? null,
      p_final_price_cents: input.finalPriceCents ?? null,
      p_note: input.note ?? '',
    }),
  })
  const booking = Array.isArray(result) ? result[0] : result
  if (!booking) throw new Error('ADMIN_UPDATE_FAILED')
  return booking
}

export type BlockedPeriodRow = {
  id: string
  work_bay_id: string | null
  starts_at: string
  ends_at: string
  reason: string
}

export async function listBlockedPeriods(db: SupabaseServer): Promise<BlockedPeriodRow[]> {
  return db.request('/rest/v1/blocked_periods?select=id,work_bay_id,starts_at,ends_at,reason&order=starts_at.asc')
}

export async function createBlockedPeriod(
  db: SupabaseServer,
  input: Omit<BlockedPeriodRow, 'id'> & { createdBy: string },
): Promise<BlockedPeriodRow> {
  const rows = await db.request<BlockedPeriodRow[]>('/rest/v1/blocked_periods?select=id,work_bay_id,starts_at,ends_at,reason', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      work_bay_id: input.work_bay_id,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      reason: input.reason,
      created_by: input.createdBy,
    }),
  })
  if (!rows[0]) throw new Error('BLOCK_NOT_CREATED')
  return rows[0]
}

export async function deleteBlockedPeriod(db: SupabaseServer, id: string): Promise<void> {
  await db.request(`/rest/v1/blocked_periods?id=eq.${id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  })
}

export async function listWorkBaysAndHours(db: SupabaseServer) {
  const [bays, hours] = await Promise.all([
    db.request<Array<{ id: string; code: string; name: string; is_active: boolean }>>('/rest/v1/work_bays?select=id,code,name,is_active&order=code.asc'),
    db.request<Array<{ weekday: number; opens_at: string | null; closes_at: string | null; is_closed: boolean }>>('/rest/v1/business_hours?select=weekday,opens_at,closes_at,is_closed&order=weekday.asc'),
  ])
  return { bays, hours }
}
