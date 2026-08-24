import { parsePublicReservationRequest } from '../../src/shared/contracts'
import { getRuntimeConfig, getTelegramSessionConfig } from './_lib/env'
import { apiError, json, readJsonBody, requestId } from './_lib/http'
import { clientIp, enforceBookingRateLimits } from './_lib/protection'
import { createPendingReservation } from './_lib/reservation-service'
import { createSupabaseServer, SupabaseError } from './_lib/supabase'
import { bearerToken, verifyTelegramSessionToken } from './_lib/telegram-auth'
import { loadOwnedVehicle, loadTelegramBookingIdentity } from './_lib/telegram-repository'

export default async function handler(request: Request): Promise<Response> {
  const id = requestId()
  try {
    if (request.method !== 'POST') return apiError(405, 'METHOD_NOT_ALLOWED', 'Use POST.', id)
    const userId = await verifyTelegramSessionToken(bearerToken(request), getTelegramSessionConfig().sessionSecret)
    const raw = await readJsonBody(request) as Record<string, unknown>
    if (typeof raw.company === 'string' && raw.company.trim()) return apiError(400, 'SPAM_REJECTED', 'The request could not be processed.', id)
    const runtime = getRuntimeConfig()
    const db = createSupabaseServer(runtime.supabaseUrl, runtime.serviceRoleKey)
    const identity = await loadTelegramBookingIdentity(db, userId)
    const existingVehicleId = typeof raw.existingVehicleId === 'string' ? raw.existingVehicleId : ''
    if (identity.contact) {
      raw.name = identity.contact.fullName
      raw.phone = identity.contact.phone
      raw.email = identity.contact.email ?? raw.email
    }
    if (existingVehicleId) {
      const vehicle = await loadOwnedVehicle(db, userId, existingVehicleId)
      raw.vehicleCategoryId = vehicle.vehicleCategoryId
      raw.vehicleDescription = vehicle.makeModel
    }
    const parsed = parsePublicReservationRequest(raw)
    if (!parsed.success) return apiError(422, 'VALIDATION_FAILED', 'Check the submitted fields.', id, parsed.errors)
    if (!await enforceBookingRateLimits(db, runtime.rateLimitSecret, {
      ip: clientIp(request), email: parsed.data.email, phone: parsed.data.phone,
    })) return apiError(429, 'RATE_LIMITED', 'Too many reservation attempts. Try again later.', id)

    const result = await createPendingReservation({
      request: parsed.data,
      db,
      minNoticeHours: runtime.minNoticeHours,
      maxDaysAhead: runtime.maxDaysAhead,
      requestId: id,
      transaction: {
        rpcPath: '/rest/v1/rpc/create_telegram_reservation_transactional_v1',
        extraBody: { p_telegram_user_id: userId, p_existing_vehicle_id: existingVehicleId || null },
      },
    })
    const { reservationId: _reservationId, wasExisting, ...publicResult } = result
    void _reservationId
    return json({ ...publicResult, profile: (await loadTelegramBookingIdentity(db, userId)).profile }, wasExisting ? 200 : 201)
  } catch (error) {
    const code = error instanceof Error ? error.message : 'TELEGRAM_BOOKING_FAILED'
    console.error(JSON.stringify({
      event: 'telegram_booking_failed',
      requestId: id,
      code,
      databaseStatus: error instanceof SupabaseError ? error.status : undefined,
      databaseCode: error instanceof SupabaseError ? error.code : undefined,
    }))
    if (code.startsWith('TELEGRAM_SESSION_')) return apiError(401, 'TELEGRAM_SESSION_INVALID', 'Open the Mini App again from Telegram.', id)
    if (code === 'BODY_TOO_LARGE') return apiError(413, code, 'The request body is too large.', id)
    if (code === 'INVALID_JSON') return apiError(400, code, 'Submit valid JSON.', id)
    if (code === 'INVALID_REQUESTED_START') return apiError(422, code, 'Select an available future time.', id)
    if (code === 'OVERNIGHT_ACK_REQUIRED') return apiError(422, code, 'Acknowledge the next-working-day continuation.', id)
    if (code === 'SCHEDULING_CONFLICT' || code === 'SLOT_UNAVAILABLE'
      || error instanceof SupabaseError && error.details?.includes('SCHEDULING_CONFLICT')) {
      return apiError(409, 'SCHEDULING_CONFLICT', 'That time is no longer available.', id)
    }
    if (code.includes('TELEGRAM_CUSTOMER') || code.includes('TELEGRAM_VEHICLE')) return apiError(422, code, 'Check the saved profile and vehicle.', id)
    if (code.startsWith('UNKNOWN_') || code === 'EMPTY_PACKAGE' || code === 'INACTIVE_PACKAGE_SERVICE') {
      return apiError(422, 'INVALID_CATALOG_SELECTION', 'A selected service is unavailable.', id)
    }
    if (code.startsWith('CONFIG_')) return apiError(503, 'TELEGRAM_NOT_CONFIGURED', 'Telegram booking is not configured.', id)
    return apiError(503, 'TELEGRAM_BOOKING_UNAVAILABLE', 'Booking is temporarily unavailable.', id)
  }
}
