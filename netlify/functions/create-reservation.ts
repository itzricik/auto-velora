import { parsePublicReservationRequest } from '../../src/shared/contracts'
import { getNotificationConfig, getRuntimeConfig } from './_lib/env'
import { apiError, enforceOrigin, json, readJsonBody, requestId } from './_lib/http'
import { logServerResult } from './_lib/logger'
import { clientIp, enforceBookingRateLimits, verifyTurnstile } from './_lib/protection'
import { createPendingReservation } from './_lib/reservation-service'
import { prepareCustomerMedia } from './_lib/media'
import { processReservationNotifications } from './_lib/reservation-notifications'
import { createSupabaseServer, SupabaseError } from './_lib/supabase'

export default async function handler(request: Request): Promise<Response> {
  const started = Date.now()
  const id = requestId()
  let resultStatus = 'error'
  let errorCode: string | undefined
  let reservationId: string | undefined

  try {
    if (request.method !== 'POST') return apiError(405, 'METHOD_NOT_ALLOWED', 'Use POST.', id)
    const config = getRuntimeConfig()
    const originError = enforceOrigin(request, config.publicSiteUrl)
    if (originError) return originError

    const body = await readJsonBody(request)
    if (body && typeof body === 'object' && !Array.isArray(body)
      && typeof (body as Record<string, unknown>).company === 'string'
      && (body as Record<string, string>).company.trim()) {
      errorCode = 'SPAM_REJECTED'
      return apiError(400, errorCode, 'The request could not be processed.', id)
    }
    const parsed = parsePublicReservationRequest(body)
    if (!parsed.success) {
      errorCode = 'VALIDATION_FAILED'
      return apiError(422, errorCode, 'Check the submitted fields.', id, parsed.errors)
    }
    const ip = clientIp(request)
    if (!await verifyTurnstile(config.turnstileSecret, parsed.data.turnstileToken, ip)) {
      errorCode = 'TURNSTILE_FAILED'
      return apiError(403, errorCode, 'Spam verification failed.', id)
    }

    const db = createSupabaseServer(config.supabaseUrl, config.serviceRoleKey)
    if (!await enforceBookingRateLimits(db, config.rateLimitSecret, {
      ip,
      email: parsed.data.email,
      phone: parsed.data.phone,
    })) {
      errorCode = 'RATE_LIMITED'
      return apiError(429, errorCode, 'Too many reservation attempts. Try again later.', id)
    }

    const result = await createPendingReservation({
      request: parsed.data,
      db,
      minNoticeHours: config.minNoticeHours,
      maxDaysAhead: config.maxDaysAhead,
      requestId: id,
    })
    reservationId = result.reservationId
    if (parsed.data.media?.length) {
      try {
        result.mediaUploads = await prepareCustomerMedia({
          db,
          supabaseUrl: config.supabaseUrl,
          rateLimitSecret: config.rateLimitSecret,
          reservationId: result.reservationId,
          descriptors: parsed.data.media,
        })
      } catch {
        result.mediaUploadError = 'MEDIA_PREPARATION_FAILED'
      }
    }
    try {
      await processReservationNotifications(db, getNotificationConfig(), result.reservationId)
    } catch {
      // Notification delivery is isolated from the booking transaction.
    }
    const { reservationId: _internalId, wasExisting, ...publicResult } = result
    void _internalId
    resultStatus = wasExisting ? 'idempotent_replay' : 'success'
    return json(publicResult, wasExisting ? 200 : 201)
  } catch (error) {
    errorCode = error instanceof Error ? error.message : 'UNEXPECTED_ERROR'
    if (errorCode === 'BODY_TOO_LARGE') return apiError(413, errorCode, 'The request body is too large.', id)
    if (errorCode === 'INVALID_JSON') return apiError(400, errorCode, 'Submit valid JSON.', id)
    if (errorCode === 'INVALID_REQUESTED_START') return apiError(422, errorCode, 'Select an available future time.', id)
    if (errorCode === 'OVERNIGHT_ACK_REQUIRED') return apiError(422, errorCode, 'Acknowledge the next-working-day continuation.', id)
    if (errorCode === 'SCHEDULING_CONFLICT') return apiError(409, errorCode, 'That time is no longer available.', id)
    if (error instanceof SupabaseError && error.code === 'P0001' && error.details?.includes('SCHEDULING_CONFLICT')) {
      return apiError(409, 'SCHEDULING_CONFLICT', 'That time is no longer available.', id)
    }
    if (errorCode.startsWith('CONFIG_')) return apiError(503, 'BOOKING_NOT_CONFIGURED', 'Booking is temporarily unavailable.', id)
    if (errorCode.startsWith('UNKNOWN_') || errorCode === 'EMPTY_PACKAGE' || errorCode === 'INACTIVE_PACKAGE_SERVICE') {
      return apiError(422, 'INVALID_CATALOG_SELECTION', 'A selected service is unavailable.', id)
    }
    if (error instanceof SupabaseError && error.status >= 500) {
      return apiError(503, 'DATABASE_UNAVAILABLE', 'Booking is temporarily unavailable.', id)
    }
    return apiError(500, 'INTERNAL_ERROR', 'The reservation request could not be created.', id)
  } finally {
    logServerResult({
      requestId: id,
      functionName: 'create-reservation',
      resultStatus,
      durationMs: Date.now() - started,
      bookingId: reservationId,
      errorCode,
    })
  }
}
