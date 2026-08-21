import { isCancellationAllowed } from '../../src/shared/status'
import { hashPublicAccessToken } from '../../src/shared/security'
import { getRuntimeConfig } from './_lib/env'
import { apiError, enforceOrigin, json, requestId } from './_lib/http'
import { logServerResult } from './_lib/logger'
import { findPublicBooking } from './_lib/repository'
import { createSupabaseServer } from './_lib/supabase'

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
    const url = new URL(request.url)
    const reference = (url.searchParams.get('reference') ?? '').toUpperCase()
    const token = url.searchParams.get('token') ?? ''
    if (!/^VEL-\d{4}-[A-Z0-9]{8}$/.test(reference) || token.length < 32 || token.length > 128) {
      errorCode = 'INVALID_ACCESS'
      return apiError(404, errorCode, 'Booking not found.', id)
    }
    const db = createSupabaseServer(config.supabaseUrl, config.serviceRoleKey)
    const booking = await findPublicBooking(db, reference, await hashPublicAccessToken(token))
    if (!booking) {
      errorCode = 'INVALID_ACCESS'
      return apiError(404, errorCode, 'Booking not found.', id)
    }
    resultStatus = 'success'
    return json({
      reference: booking.reference,
      status: booking.status,
      start: booking.starts_at,
      end: booking.ends_at,
      estimatedPriceCents: booking.estimated_price_cents,
      estimatedDurationMinutes: booking.estimated_duration_minutes,
      vehicleDescription: booking.vehicle_make_model_snapshot,
      services: booking.booking_items,
      canCancel: isCancellationAllowed({
        status: booking.status,
        startsAt: booking.starts_at,
        cancellationHours: config.cancellationHours,
      }),
      requestId: id,
    })
  } catch (error) {
    errorCode = error instanceof Error ? error.message : 'UNEXPECTED_ERROR'
    return apiError(errorCode.startsWith('CONFIG_') ? 503 : 500, 'STATUS_UNAVAILABLE', 'Booking status is temporarily unavailable.', id)
  } finally {
    logServerResult({
      requestId: id,
      functionName: 'booking-status',
      resultStatus,
      durationMs: Date.now() - started,
      errorCode,
    })
  }
}
