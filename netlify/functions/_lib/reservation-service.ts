import type { PublicReservationRequest, PublicReservationResult } from '../../../src/shared/contracts'
import { calculateServerEstimate } from '../../../src/shared/pricing'
import { createSecureReference } from '../../../src/shared/security'
import { loadCatalogSelection } from './repository'
import { SupabaseError, type SupabaseServer } from './supabase'

type TransactionResult = {
  reservation_id: string
  reference: string
  status: 'pending'
  starts_at: string
  ends_at: string
  work_bay_id: string
  estimated_total_cents: number
  calculated_duration_minutes: number
  was_existing: boolean
}

const messages = {
  en: 'Your reservation request is saved and the time is being held. Keep the reference for future communication.',
  lv: 'Jūsu rezervācijas pieprasījums ir saglabāts, un laiks ir rezervēts. Saglabājiet atsauces numuru.',
  ru: 'Ваш запрос сохранён, выбранное время удерживается. Сохраните номер заявки.',
} as const

function dateInRiga(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Riga', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export async function createPendingReservation(input: {
  request: PublicReservationRequest
  db: SupabaseServer
  minNoticeHours: number
  maxDaysAhead: number
  requestId: string
  now?: Date
}): Promise<PublicReservationResult & { reservationId: string; wasExisting: boolean }> {
  const now = input.now ?? new Date()
  const notBefore = new Date(now.getTime() + Math.max(0, input.minNoticeHours) * 3_600_000)
  const today = dateInRiga(now)
  const requested = new Date(input.request.requestedStart)
  const requestedDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Riga', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(requested)
  const daysAhead = Math.floor((Date.parse(`${requestedDate}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000)
  if (!Number.isFinite(daysAhead) || requested < notBefore || daysAhead < 0 || daysAhead > input.maxDaysAhead) {
    throw new Error('INVALID_REQUESTED_START')
  }

  const catalog = await loadCatalogSelection(input.db, {
    vehicleCategoryId: input.request.vehicleCategoryId,
    serviceIds: input.request.serviceIds,
    packageId: input.request.packageId,
    language: input.request.language,
  })
  const estimate = calculateServerEstimate(catalog)
  const availability = await input.db.request<{
    slots: Array<{ start: string; end: string }>
  }>('/rest/v1/rpc/scheduling_availability', {
    method: 'POST',
    body: JSON.stringify({
      p_duration_minutes: estimate.durationMinutes,
      p_date: requestedDate,
      p_not_before: notBefore.toISOString(),
      p_max_days: input.maxDaysAhead,
      p_increment_minutes: null,
    }),
  })
  const selectedPlan = availability.slots.find((slot) => Date.parse(slot.start) === requested.getTime())
  if (!selectedPlan) throw new Error('SCHEDULING_CONFLICT')
  const completionDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Riga', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(selectedPlan.end))
  if (completionDate !== requestedDate && !input.request.overnightAcknowledged) {
    throw new Error('OVERNIGHT_ACK_REQUIRED')
  }
  const snapshots = estimate.services.map((service) => ({
    service_id: service.id,
    service_name: service.name,
    base_price_cents: service.basePriceCents,
    calculated_price_cents: estimate.itemPricesCents[service.id],
    duration_minutes: service.baseDurationMinutes,
    buffer_minutes: service.bufferMinutes ?? 0,
  }))

  let result: TransactionResult | undefined
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const rows = await input.db.request<TransactionResult[]>('/rest/v1/rpc/create_scheduled_reservation_transactional_v2', {
        method: 'POST',
        body: JSON.stringify({
          p_reference: createSecureReference(now),
          p_full_name: input.request.name,
          p_phone: input.request.phone,
          p_email: input.request.email,
          p_vehicle_category_id: input.request.vehicleCategoryId,
          p_vehicle_description: input.request.vehicleDescription,
          p_requested_start: input.request.requestedStart,
          p_estimated_total_cents: estimate.priceCents,
          p_calculated_duration_minutes: estimate.durationMinutes,
          p_language: input.request.language,
          p_customer_message: input.request.customerNotes ?? '',
          p_idempotency_key: input.request.idempotencyKey,
          p_vehicle_snapshot: { code: catalog.vehicle.code, multiplier: catalog.vehicle.priceMultiplier },
          p_service_snapshots: snapshots,
          p_package_snapshot: catalog.package ? {
            package_id: catalog.package.id,
            package_code: catalog.package.code,
            package_name: catalog.package.name,
            package_price_cents: catalog.package.packagePriceCents,
            duration_minutes: catalog.package.baseDurationMinutes,
            buffer_minutes: catalog.package.bufferMinutes ?? 0,
          } : null,
        }),
      })
      result = rows[0]
      break
    } catch (error) {
      if (error instanceof SupabaseError && error.code === '23505' && attempt < 2) continue
      throw error
    }
  }

  if (!result) throw new Error('RESERVATION_NOT_CREATED')
  return {
    reservationId: result.reservation_id,
    wasExisting: result.was_existing,
    reference: result.reference,
    status: 'pending',
    start: result.starts_at,
    end: result.ends_at,
    serverPriceCents: result.estimated_total_cents,
    serverDurationMinutes: result.calculated_duration_minutes,
    message: messages[input.request.language],
    requestId: input.requestId,
  }
}
