import type { BookingLanguage, BookingStatus } from '../../../src/shared/contracts'
import type { ConditionRule } from '../../../src/shared/condition'
import type { PricingPackage, PricingService, PricingVehicle } from '../../../src/shared/pricing'
import { inFilter, type SupabaseServer } from './supabase'

type VehicleRow = {
  id: string
  code: string
  name_en: string
  name_lv: string
  name_ru: string
  price_multiplier: number
  duration_multiplier: number
}

type ServiceRow = {
  id: string
  code: string
  name_en: string
  name_lv: string
  name_ru: string
  base_price_cents: number
  base_duration_minutes: number
  buffer_minutes: number
}

type PackageRow = {
  id: string
  code: string
  name_en: string
  name_lv: string
  name_ru: string
  package_price_cents: number
  base_duration_minutes: number
  buffer_minutes: number
}

function serviceName(row: ServiceRow, language: BookingLanguage): string {
  return language === 'lv' ? row.name_lv : language === 'ru' ? row.name_ru : row.name_en
}

function pricingService(row: ServiceRow, language: BookingLanguage): PricingService {
  return {
    id: row.id,
    code: row.code,
    name: serviceName(row, language),
    basePriceCents: row.base_price_cents,
    baseDurationMinutes: row.base_duration_minutes,
    bufferMinutes: row.buffer_minutes,
  }
}

export type CatalogSelection = {
  vehicle: PricingVehicle
  services: PricingService[]
  package?: PricingPackage
}

export async function loadCatalogSelection(
  db: SupabaseServer,
  input: {
    vehicleCategoryId: string
    serviceIds: string[]
    packageId?: string
    language: BookingLanguage
  },
): Promise<CatalogSelection> {
  const vehicles = await db.request<VehicleRow[]>(
    `/rest/v1/vehicle_categories?id=eq.${input.vehicleCategoryId}&is_active=eq.true&select=id,code,name_en,name_lv,name_ru,price_multiplier,duration_multiplier&limit=1`,
  )
  const vehicleRow = vehicles[0]
  if (!vehicleRow) throw new Error('UNKNOWN_VEHICLE_CATEGORY')
  const vehicle: PricingVehicle = {
    id: vehicleRow.id,
    code: vehicleRow.code,
    name: input.language === 'lv' ? vehicleRow.name_lv : input.language === 'ru' ? vehicleRow.name_ru : vehicleRow.name_en,
    priceMultiplier: Number(vehicleRow.price_multiplier),
    durationMultiplier: Number(vehicleRow.duration_multiplier),
  }

  if (input.packageId) {
    const packageRows = await db.request<PackageRow[]>(
      `/rest/v1/service_packages?id=eq.${input.packageId}&is_active=eq.true&select=id,code,name_en,name_lv,name_ru,package_price_cents,base_duration_minutes,buffer_minutes&limit=1`,
    )
    const packageRow = packageRows[0]
    if (!packageRow) throw new Error('UNKNOWN_PACKAGE')
    const links = await db.request<Array<{ service_id: string }>>(
      `/rest/v1/package_services?package_id=eq.${input.packageId}&select=service_id&order=sort_order.asc`,
    )
    if (!links.length) throw new Error('EMPTY_PACKAGE')
    const rows = await db.request<ServiceRow[]>(
      `/rest/v1/services?id=${inFilter(links.map((link) => link.service_id))}&is_active=eq.true&select=id,code,name_en,name_lv,name_ru,base_price_cents,base_duration_minutes,buffer_minutes`,
    )
    if (rows.length !== links.length) throw new Error('INACTIVE_PACKAGE_SERVICE')
    const byId = new Map(rows.map((row) => [row.id, row]))
    const services = links.map((link) => pricingService(byId.get(link.service_id) as ServiceRow, input.language))
    return {
      vehicle,
      services,
      package: {
        id: packageRow.id,
        code: packageRow.code,
        name: input.language === 'lv' ? packageRow.name_lv : input.language === 'ru' ? packageRow.name_ru : packageRow.name_en,
        packagePriceCents: packageRow.package_price_cents,
        baseDurationMinutes: packageRow.base_duration_minutes,
        bufferMinutes: packageRow.buffer_minutes,
        services,
      },
    }
  }

  const uniqueIds = [...new Set(input.serviceIds)]
  const rows = await db.request<ServiceRow[]>(
    `/rest/v1/services?id=${inFilter(uniqueIds)}&is_active=eq.true&select=id,code,name_en,name_lv,name_ru,base_price_cents,base_duration_minutes,buffer_minutes`,
  )
  if (rows.length !== uniqueIds.length) throw new Error('UNKNOWN_SERVICE')
  const byId = new Map(rows.map((row) => [row.id, row]))
  return {
    vehicle,
    services: uniqueIds.map((id) => pricingService(byId.get(id) as ServiceRow, input.language)),
  }
}

export async function loadConditionSelection(
  db: SupabaseServer,
  input: { levelId: string; indicatorIds: string[] },
): Promise<{ level: ConditionRule; indicators: ConditionRule[] }> {
  const select = 'id,code,label_en,label_lv,label_ru,explanation_en,explanation_lv,explanation_ru,min_surcharge_cents,max_surcharge_cents,min_duration_minutes,max_duration_minutes,is_active,sort_order,requires_business_confirmation'
  const [levels, indicators] = await Promise.all([
    db.request<ConditionRule[]>(`/rest/v1/condition_levels?id=eq.${input.levelId}&is_active=eq.true&select=${select}&limit=1`),
    input.indicatorIds.length
      ? db.request<ConditionRule[]>(`/rest/v1/condition_indicators?id=${inFilter(input.indicatorIds)}&is_active=eq.true&select=${select}`)
      : Promise.resolve([]),
  ])
  if (!levels[0]) throw new Error('UNKNOWN_CONDITION_LEVEL')
  if (indicators.length !== input.indicatorIds.length) throw new Error('UNKNOWN_CONDITION_INDICATOR')
  const byId = new Map(indicators.map((row) => [row.id, row]))
  return { level: levels[0], indicators: input.indicatorIds.map((id) => byId.get(id) as ConditionRule) }
}

export type TransactionalBooking = {
  booking_id: string
  reference: string
  status: Extract<BookingStatus, 'new' | 'confirmed'>
  starts_at: string
  ends_at: string
  estimated_price_cents: number
  estimated_duration_minutes: number
  was_existing: boolean
}

export async function createBookingTransaction(
  db: SupabaseServer,
  input: Record<string, unknown>,
): Promise<TransactionalBooking> {
  const rows = await db.request<TransactionalBooking[]>('/rest/v1/rpc/create_booking_transactional', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!rows[0]) throw new Error('BOOKING_NOT_CREATED')
  return rows[0]
}

export async function checkRateLimit(
  db: SupabaseServer,
  identifierHash: string,
  scope: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  return db.request<boolean>('/rest/v1/rpc/check_rate_limit', {
    method: 'POST',
    body: JSON.stringify({
      p_identifier_hash: identifierHash,
      p_scope: scope,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    }),
  })
}

export type PublicStatusRow = {
  id: string
  reference: string
  status: BookingStatus
  starts_at: string
  ends_at: string
  estimated_price_cents: number
  estimated_duration_minutes: number
  vehicle_make_model_snapshot: string
  booking_items: Array<{
    service_name_snapshot: string
    calculated_price_cents_snapshot: number
  }>
}

export async function findPublicBooking(
  db: SupabaseServer,
  reference: string,
  tokenHash: string,
): Promise<PublicStatusRow | null> {
  const rows = await db.request<PublicStatusRow[]>(
    `/rest/v1/booking_requests?reference=eq.${encodeURIComponent(reference)}&public_access_token_hash=eq.${tokenHash}&select=id,reference,status,starts_at,ends_at,estimated_price_cents,estimated_duration_minutes,vehicle_make_model_snapshot,booking_items(service_name_snapshot,calculated_price_cents_snapshot)&limit=1`,
  )
  return rows[0] ?? null
}

export async function cancelPublicBooking(
  db: SupabaseServer,
  reference: string,
  tokenHash: string,
  reason: string,
  cancellationHours: number,
): Promise<{ booking_id: string; status: BookingStatus; starts_at: string }> {
  const rows = await db.request<Array<{ booking_id: string; status: BookingStatus; starts_at: string }>>(
    '/rest/v1/rpc/cancel_public_booking',
    {
      method: 'POST',
      body: JSON.stringify({
        p_reference: reference,
        p_token_hash: tokenHash,
        p_reason: reason,
        p_cancellation_hours: cancellationHours,
      }),
    },
  )
  if (!rows[0]) throw new Error('BOOKING_NOT_CANCELLED')
  return rows[0]
}

export async function createNotificationLog(
  db: SupabaseServer,
  input: {
    bookingId: string
    type: string
    recipient: string
  },
): Promise<string> {
  const rows = await db.request<Array<{ id: string }>>('/rest/v1/notification_logs?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      booking_request_id: input.bookingId,
      notification_type: input.type,
      recipient: input.recipient,
      provider: 'resend',
      status: 'pending',
    }),
  })
  if (!rows[0]) throw new Error('NOTIFICATION_LOG_FAILED')
  return rows[0].id
}

export async function updateNotificationLog(
  db: SupabaseServer,
  id: string,
  input: {
    status: 'sent' | 'failed'
    providerMessageId?: string
    errorCode?: string
  },
): Promise<void> {
  await db.request(`/rest/v1/notification_logs?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: input.status,
      provider_message_id: input.providerMessageId ?? null,
      error_message: input.errorCode ?? null,
      sent_at: input.status === 'sent' ? new Date().toISOString() : null,
    }),
  })
}

export type NotificationBooking = {
  id: string
  reference: string
  status: BookingStatus
  starts_at: string
  ends_at: string
  estimated_price_cents: number
  vehicle_make_model_snapshot: string
  booking_language: BookingLanguage
  customers: { normalized_email: string } | Array<{ normalized_email: string }>
  booking_items: Array<{ service_name_snapshot: string }>
}

export async function loadNotificationBooking(db: SupabaseServer, bookingId: string): Promise<NotificationBooking | null> {
  const rows = await db.request<NotificationBooking[]>(
    `/rest/v1/booking_requests?id=eq.${bookingId}&select=id,reference,status,starts_at,ends_at,estimated_price_cents,vehicle_make_model_snapshot,booking_language,customers(normalized_email),booking_items(service_name_snapshot)&limit=1`,
  )
  return rows[0] ?? null
}
