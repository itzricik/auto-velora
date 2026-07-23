import { hashPublicAccessToken } from '../../src/shared/security'
import { getRuntimeConfig } from './_lib/env'
import { apiError, enforceOrigin, json, readJsonBody, requestId } from './_lib/http'
import { logServerResult } from './_lib/logger'
import { cancelPublicBooking } from './_lib/repository'
import { createSupabaseServer, SupabaseError } from './_lib/supabase'

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
    const body = await readJsonBody(request) as Record<string, unknown>
    const reference = typeof body.reference === 'string' ? body.reference.trim().toUpperCase() : ''
    const token = typeof body.token === 'string' ? body.token : ''
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
    if (!/^VEL-\d{4}-[A-Z0-9]{8}$/.test(reference) || token.length < 32 || token.length > 128) {
      errorCode = 'INVALID_ACCESS'
      return apiError(404, errorCode, 'Booking not found.', id)
    }
    const db = createSupabaseServer(config.supabaseUrl, config.serviceRoleKey)
    const result = await cancelPublicBooking(
      db,
      reference,
      await hashPublicAccessToken(token),
      reason,
      config.cancellationHours,
    )
    bookingId = result.booking_id
    resultStatus = 'success'
    return json({ reference, status: result.status, start: result.starts_at, requestId: id })
  } catch (error) {
    errorCode = error instanceof Error ? error.message : 'UNEXPECTED_ERROR'
    if (error instanceof SupabaseError && (error.code === 'P0001' || error.code === 'P0002')) {
      return apiError(error.code === 'P0002' ? 404 : 409, 'CANCELLATION_NOT_ALLOWED', 'This booking cannot be cancelled online.', id)
    }
    return apiError(errorCode.startsWith('CONFIG_') ? 503 : 500, 'CANCELLATION_FAILED', 'Cancellation could not be completed.', id)
  } finally {
    logServerResult({
      requestId: id,
      functionName: 'booking-cancel',
      resultStatus,
      durationMs: Date.now() - started,
      bookingId,
      errorCode,
    })
  }
}
