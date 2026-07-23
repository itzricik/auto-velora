import { BOOKING_STATUSES, isUuid, type BookingStatus } from '../../src/shared/contracts'
import { derivePublicAccessToken } from '../../src/shared/security'
import { requireAdmin } from './_lib/admin-auth'
import { adminUpdateBooking, getAdminBooking } from './_lib/admin-repository'
import { getNotificationConfig, getRuntimeConfig } from './_lib/env'
import { apiError, enforceOrigin, json, readJsonBody, requestId } from './_lib/http'
import { logServerResult } from './_lib/logger'
import { sendBookingNotifications } from './_lib/notifications'
import { loadNotificationBooking } from './_lib/repository'
import { createSupabaseServer, SupabaseError } from './_lib/supabase'

function validIso(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

export default async function handler(request: Request): Promise<Response> {
  const started = Date.now()
  const id = requestId()
  let resultStatus = 'error'
  let errorCode: string | undefined
  let bookingId: string | undefined

  try {
    if (request.method !== 'POST') return apiError(405, 'METHOD_NOT_ALLOWED', 'Use POST.', id)
    const config = getRuntimeConfig()
    const originError = enforceOrigin(request, config.publicSiteUrl)
    if (originError) return originError
    const db = createSupabaseServer(config.supabaseUrl, config.serviceRoleKey)
    const identity = await requireAdmin(request, {
      supabaseUrl: config.supabaseUrl,
      anonKey: config.supabaseAnonKey,
      db,
    })
    const body = await readJsonBody(request) as Record<string, unknown>
    bookingId = typeof body.bookingId === 'string' ? body.bookingId : undefined
    const status = typeof body.status === 'string' && BOOKING_STATUSES.includes(body.status as BookingStatus)
      ? body.status as BookingStatus
      : undefined
    if (!bookingId || !isUuid(bookingId)) return apiError(422, 'INVALID_BOOKING_ID', 'Invalid booking.', id)
    if (body.status && !status) return apiError(422, 'INVALID_STATUS', 'Invalid status.', id)
    const startsAt = body.startsAt == null ? undefined : validIso(body.startsAt) ? body.startsAt : null
    const endsAt = body.endsAt == null ? undefined : validIso(body.endsAt) ? body.endsAt : null
    if (startsAt === null || endsAt === null) return apiError(422, 'INVALID_INTERVAL', 'Invalid booking interval.', id)
    const internalNotes = typeof body.internalNotes === 'string' ? body.internalNotes.trim() : undefined
    const note = typeof body.note === 'string' ? body.note.trim() : undefined
    if ((internalNotes?.length ?? 0) > 5000 || (note?.length ?? 0) > 1000) {
      return apiError(422, 'FIELD_TOO_LONG', 'An administrative note is too long.', id)
    }
    const finalPriceCents = body.finalPriceCents == null ? undefined : Number(body.finalPriceCents)
    if (finalPriceCents != null && (!Number.isInteger(finalPriceCents) || finalPriceCents < 0)) {
      return apiError(422, 'INVALID_FINAL_PRICE', 'Final price must be integer cents.', id)
    }

    const before = await getAdminBooking(db, bookingId)
    if (!before) return apiError(404, 'BOOKING_NOT_FOUND', 'Booking not found.', id)
    await adminUpdateBooking(db, {
      bookingId,
      changedBy: identity.userId,
      newStatus: status,
      startsAt,
      endsAt,
      internalNotes,
      finalPriceCents,
      note,
    })
    const updated = await getAdminBooking(db, bookingId)
    if (!updated) throw new Error('ADMIN_UPDATE_FAILED')

    const event = status === 'confirmed'
      ? 'confirmed'
      : status === 'cancelled'
        ? 'cancelled'
        : status === 'completed'
          ? 'completed'
          : startsAt || endsAt
            ? 'rescheduled'
            : null
    if (event) {
      const notification = await loadNotificationBooking(db, bookingId)
      if (notification) {
        const person = Array.isArray(notification.customers) ? notification.customers[0] : notification.customers
        if (!person) throw new Error('NOTIFICATION_CUSTOMER_MISSING')
        const accessToken = await derivePublicAccessToken(config.rateLimitSecret, updated.idempotency_key)
        await sendBookingNotifications(db, getNotificationConfig(), {
          bookingId,
          customerEmail: person.normalized_email,
          reference: updated.reference,
          status: updated.status,
          start: updated.starts_at,
          end: updated.ends_at,
          services: updated.booking_services.map((service) => service.service_name_snapshot),
          vehicle: updated.vehicle_description,
          estimatedPriceCents: updated.estimated_price_cents,
          managementUrl: `${config.publicSiteUrl}/booking?reference=${encodeURIComponent(updated.reference)}&token=${encodeURIComponent(accessToken)}`,
          language: updated.booking_language,
          event,
        }).catch(() => 'failed')
      }
    }
    resultStatus = 'success'
    return json({ booking: updated, requestId: id })
  } catch (error) {
    errorCode = error instanceof Error ? error.message : 'UNEXPECTED_ERROR'
    if (errorCode === 'ADMIN_UNAUTHENTICATED') return apiError(401, errorCode, 'Sign in is required.', id)
    if (errorCode === 'ADMIN_FORBIDDEN') return apiError(403, errorCode, 'Active staff access is required.', id)
    if (error instanceof SupabaseError && (error.code === '23P01' || error.code === 'P0001')) {
      return apiError(409, 'ADMIN_CONFLICT', 'The action conflicts with availability or status rules.', id)
    }
    return apiError(errorCode.startsWith('CONFIG_') ? 503 : 500, 'ADMIN_UPDATE_FAILED', 'The booking could not be updated.', id)
  } finally {
    logServerResult({
      requestId: id,
      functionName: 'admin-booking-action',
      resultStatus,
      durationMs: Date.now() - started,
      bookingId,
      errorCode,
    })
  }
}
