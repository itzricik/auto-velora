import type { PublicBookingRequest, PublicBookingResult } from '../../../src/shared/contracts'
import { calculateServerEstimate } from '../../../src/shared/pricing'
import { createSecureReference, derivePublicAccessToken, hashPublicAccessToken } from '../../../src/shared/security'
import type { ApprovalMode } from './env'
import { createBookingTransaction, loadCatalogSelection } from './repository'
import { getAvailableSlots } from './scheduling'
import { SupabaseError, type SupabaseServer } from './supabase'

const messages = {
  en: {
    new: 'Your booking request was created and is awaiting studio confirmation.',
    confirmed: 'Your booking was confirmed.',
  },
  lv: {
    new: 'Jūsu vizītes pieprasījums ir izveidots un gaida studijas apstiprinājumu.',
    confirmed: 'Jūsu vizīte ir apstiprināta.',
  },
  ru: {
    new: 'Ваш запрос на запись создан и ожидает подтверждения студией.',
    confirmed: 'Ваша запись подтверждена.',
  },
} as const

function localDateInZone(iso: string, timezone: string): string {
  const values: Record<string, string> = {}
  for (const part of new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso))) {
    if (part.type !== 'literal') values[part.type] = part.value
  }
  return `${values.year}-${values.month}-${values.day}`
}

export async function createProfessionalBooking(input: {
  request: PublicBookingRequest
  db: SupabaseServer
  approvalMode: ApprovalMode
  studioTimezone: string
  minNoticeHours: number
  maxDaysAhead: number
  bufferMinutes: number
  tokenSecret: string
  requestId: string
  now?: Date
}): Promise<PublicBookingResult & {
  bookingId: string
  wasExisting: boolean
}> {
  const catalog = await loadCatalogSelection(input.db, {
    vehicleCategoryId: input.request.vehicleCategoryId,
    serviceIds: input.request.serviceIds,
    packageId: input.request.packageId,
    language: input.request.language,
  })
  const estimate = calculateServerEstimate(catalog)
  const basePriceCents = catalog.package?.packagePriceCents
    ?? estimate.services.reduce((total, service) => total + service.basePriceCents, 0)
  const localDate = localDateInZone(input.request.requestedStart, input.studioTimezone)
  const availability = await getAvailableSlots(input.db, {
    localDate,
    vehicleCategoryId: input.request.vehicleCategoryId,
    serviceIds: input.request.serviceIds,
    packageId: input.request.packageId,
    timezone: input.studioTimezone,
    language: input.request.language,
  }, {
    studioTimezone: input.studioTimezone,
    bufferMinutes: input.bufferMinutes,
    minNoticeHours: input.minNoticeHours,
    maxDaysAhead: input.maxDaysAhead,
    now: input.now,
  })
  const selectedSlot = availability.slots.find((slot) => slot.start === input.request.requestedStart)
  if (!selectedSlot) throw new Error('SLOT_UNAVAILABLE')

  const accessToken = await derivePublicAccessToken(input.tokenSecret, input.request.idempotencyKey)
  const accessTokenHash = await hashPublicAccessToken(accessToken)
  const desiredStatus = input.approvalMode === 'automatic' ? 'confirmed' : 'new'
  let booking

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      booking = await createBookingTransaction(input.db, {
        p_reference: createSecureReference(input.now),
        p_public_access_token_hash: accessTokenHash,
        p_full_name: input.request.name,
        p_normalized_email: input.request.email,
        p_normalized_phone: input.request.phone,
        p_vehicle_category_id: input.request.vehicleCategoryId,
        p_vehicle_description: input.request.vehicleDescription,
        p_starts_at: selectedSlot.start,
        p_ends_at: selectedSlot.end,
        p_status: desiredStatus,
        p_base_price_cents: basePriceCents,
        p_estimated_price_cents: estimate.priceCents,
        p_estimated_duration_minutes: estimate.durationMinutes,
        p_pricing_version: '2026-08-supabase-v1',
        p_booking_language: input.request.language,
        p_customer_notes: input.request.customerNotes ?? '',
        p_consent_timestamp: (input.now ?? new Date()).toISOString(),
        p_consent_policy_version: input.request.consentPolicyVersion,
        p_idempotency_key: input.request.idempotencyKey,
        p_vehicle_snapshot: {
          code: catalog.vehicle.code,
          name: catalog.vehicle.name,
          multiplier: catalog.vehicle.priceMultiplier,
        },
        p_service_snapshots: estimate.services.map((service) => ({
          service_id: service.id,
          service_code: service.code,
          service_name: service.name,
          base_price_cents: service.basePriceCents,
          calculated_price_cents: estimate.itemPricesCents[service.id],
          duration_minutes: service.baseDurationMinutes,
        })),
      })
      break
    } catch (error) {
      if (error instanceof SupabaseError && error.code === '23505' && attempt < 2) continue
      if (error instanceof SupabaseError && error.code === '23P01') throw new Error('SLOT_UNAVAILABLE')
      throw error
    }
  }

  if (!booking) throw new Error('BOOKING_NOT_CREATED')
  return {
    bookingId: booking.booking_id,
    wasExisting: booking.was_existing,
    reference: booking.reference,
    status: booking.status,
    start: booking.starts_at,
    end: booking.ends_at,
    serverPriceCents: booking.estimated_price_cents,
    serverDurationMinutes: booking.estimated_duration_minutes,
    message: messages[input.request.language][booking.status],
    requestId: input.requestId,
  }
}
