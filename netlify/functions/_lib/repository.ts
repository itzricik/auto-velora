import type { BookingLanguage, BookingStatus } from '../../../src/shared/contracts'
import type { PricingPackage, PricingService, PricingVehicle } from '../../../src/shared/pricing'
import { inFilter, type SupabaseServer } from './supabase'

type VehicleRow = {
  id: string
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
}

type PackageRow = {
  id: string
  package_price_cents: number
  base_duration_minutes: number
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
    `/rest/v1/vehicle_categories?id=eq.${input.vehicleCategoryId}&is_active=eq.true&select=id,price_multiplier,duration_multiplier&limit=1`,
  )
  const vehicleRow = vehicles[0]
  if (!vehicleRow) throw new Error('UNKNOWN_VEHICLE_CATEGORY')
  const vehicle: PricingVehicle = {
    id: vehicleRow.id,
    priceMultiplier: Number(vehicleRow.price_multiplier),
    durationMultiplier: Number(vehicleRow.duration_multiplier),
  }

  if (input.packageId) {
    const packageRows = await db.request<PackageRow[]>(
      `/rest/v1/service_packages?id=eq.${input.packageId}&is_active=eq.true&select=id,package_price_cents,base_duration_minutes&limit=1`,
    )
    const packageRow = packageRows[0]
    if (!packageRow) throw new Error('UNKNOWN_PACKAGE')
    const links = await db.request<Array<{ service_id: string }>>(
      `/rest/v1/package_services?package_id=eq.${input.packageId}&select=service_id&order=sort_order.asc`,
    )
    if (!links.length) throw new Error('EMPTY_PACKAGE')
    const rows = await db.request<ServiceRow[]>(
      `/rest/v1/services?id=${inFilter(links.map((link) => link.service_id))}&is_active=eq.true&select=id,code,name_en,name_lv,name_ru,base_price_cents,base_duration_minutes`,
    )
    if (rows.length !== links.length) throw new Error('INACTIVE_PACKAGE_SERVICE')
    const byId = new Map(rows.map((row) => [row.id, row]))
    const services = links.map((link) => pricingService(byId.get(link.service_id) as ServiceRow, input.language))
    return {
      vehicle,
      services,
      package: {
        id: packageRow.id,
        packagePriceCents: packageRow.package_price_cents,
        baseDurationMinutes: packageRow.base_duration_minutes,
        services,
      },
    }
  }

  const uniqueIds = [...new Set(input.serviceIds)]
  const rows = await db.request<ServiceRow[]>(
    `/rest/v1/services?id=${inFilter(uniqueIds)}&is_active=eq.true&select=id,code,name_en,name_lv,name_ru,base_price_cents,base_duration_minutes`,
  )
  if (rows.length !== uniqueIds.length) throw new Error('UNKNOWN_SERVICE')
  const byId = new Map(rows.map((row) => [row.id, row]))
  return {
    vehicle,
    services: uniqueIds.map((id) => pricingService(byId.get(id) as ServiceRow, input.language)),
  }
}

export type TransactionalBooking = {
  booking_id: string
  reference: string
  status: Extract<BookingStatus, 'requested' | 'confirmed'>
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
  vehicle_description: string
  cancellation_reason: string | null
  booking_services: Array<{
    service_name_snapshot: string
    unit_price_cents_snapshot: number
  }>
}

export async function findPublicBooking(
  db: SupabaseServer,
  reference: string,
  tokenHash: string,
): Promise<PublicStatusRow | null> {
  const rows = await db.request<PublicStatusRow[]>(
    `/rest/v1/bookings?reference=eq.${encodeURIComponent(reference)}&public_access_token_hash=eq.${tokenHash}&select=id,reference,status,starts_at,ends_at,estimated_price_cents,estimated_duration_minutes,vehicle_description,cancellation_reason,booking_services(service_name_snapshot,unit_price_cents_snapshot)&limit=1`,
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
