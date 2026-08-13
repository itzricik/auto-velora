import { BOOKING_STATUSES, isUuid, type BookingStatus } from '../../src/shared/contracts'
import { requireAdmin } from './_lib/admin-auth'
import { getAdminBooking, getAdminSummary, listAdminBookings, type AdminBooking } from './_lib/admin-repository'
import { getRuntimeConfig } from './_lib/env'
import { apiError, enforceOrigin, json, requestId } from './_lib/http'
import { logServerResult } from './_lib/logger'
import { createSupabaseServer } from './_lib/supabase'

function customer(booking: AdminBooking) {
  return Array.isArray(booking.customers) ? booking.customers[0] : booking.customers
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function createCsv(rows: AdminBooking[]): string {
  const headers = ['Reference', 'Status', 'Start', 'End', 'Customer', 'Email', 'Phone', 'Vehicle', 'Services', 'Estimate EUR', 'Final EUR']
  const records = rows.map((booking) => {
    const person = customer(booking)
    return [
      booking.reference,
      booking.status,
      booking.starts_at,
      booking.ends_at,
      person?.full_name,
      person?.normalized_email,
      person?.normalized_phone,
      booking.vehicle_description,
      booking.booking_services.map((service) => service.service_name_snapshot).join('; '),
      (booking.estimated_price_cents / 100).toFixed(2),
      booking.final_price_cents == null ? '' : (booking.final_price_cents / 100).toFixed(2),
    ].map(csvCell).join(',')
  })
  return `\uFEFF${[headers.map(csvCell).join(','), ...records].join('\r\n')}`
}

export default async function handler(request: Request): Promise<Response> {
  const started = Date.now()
  const id = requestId()
  let resultStatus = 'error'
  let errorCode: string | undefined

  try {
    if (request.method !== 'GET') return apiError(405, 'METHOD_NOT_ALLOWED', 'Use GET.', id)
    const config = getRuntimeConfig()
    const originError = enforceOrigin(request, config.publicSiteUrl)
    if (originError) return originError
    const db = createSupabaseServer(config.supabaseUrl, config.serviceRoleKey)
    const identity = await requireAdmin(request, {
      supabaseUrl: config.supabaseUrl,
      anonKey: config.supabaseAnonKey,
      db,
    })
    const url = new URL(request.url)
    const bookingId = url.searchParams.get('id')
    if (bookingId) {
      if (!isUuid(bookingId)) return apiError(422, 'INVALID_BOOKING_ID', 'Invalid booking.', id)
      const booking = await getAdminBooking(db, bookingId)
      if (!booking) return apiError(404, 'BOOKING_NOT_FOUND', 'Booking not found.', id)
      resultStatus = 'success'
      return json({ booking, identity, requestId: id })
    }

    const statusValue = url.searchParams.get('status') || undefined
    const status = statusValue && BOOKING_STATUSES.includes(statusValue as BookingStatus)
      ? statusValue as BookingStatus
      : undefined
    const exporting = url.searchParams.get('export') === 'csv'
    if (exporting && identity.role !== 'admin') return apiError(403, 'ADMIN_ONLY', 'CSV export requires an administrator.', id)
    const page = Math.max(0, Number(url.searchParams.get('page') ?? 0) || 0)
    const pageSize = exporting ? 5000 : Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') ?? 25) || 25))
    const result = await listAdminBookings(db, {
      from: url.searchParams.get('from') || undefined,
      to: url.searchParams.get('to') || undefined,
      status,
      search: url.searchParams.get('search') || undefined,
      page: exporting ? 0 : page,
      pageSize,
      sort: url.searchParams.get('sort') === 'asc' ? 'asc' : 'desc',
    })
    resultStatus = 'success'
    if (exporting) {
      return new Response(createCsv(result.rows), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="velora-bookings.csv"',
          'Cache-Control': 'no-store',
        },
      })
    }
    return json({
      bookings: result.rows,
      hasMore: result.hasMore,
      page,
      summary: await getAdminSummary(db),
      identity,
      requestId: id,
    })
  } catch (error) {
    errorCode = error instanceof Error ? error.message : 'UNEXPECTED_ERROR'
    if (errorCode === 'ADMIN_UNAUTHENTICATED') return apiError(401, errorCode, 'Sign in is required.', id)
    if (errorCode === 'ADMIN_FORBIDDEN') return apiError(403, errorCode, 'Active staff access is required.', id)
    return apiError(errorCode.startsWith('CONFIG_') ? 503 : 500, 'ADMIN_LIST_FAILED', 'Bookings could not be loaded.', id)
  } finally {
    logServerResult({
      requestId: id,
      functionName: 'admin-bookings',
      resultStatus,
      durationMs: Date.now() - started,
      errorCode,
    })
  }
}
