import type { BookingLanguage, BookingStatus } from '../../../src/shared/contracts'
import { telegramLanguage, type TelegramBooking, type TelegramIdentity, type TelegramProfile, type TelegramVehicle } from '../../../src/shared/telegram'
import type { SupabaseServer } from './supabase'

type ProfileRow = {
  telegram_user_id: number
  customer_id: string | null
  username: string | null
  first_name: string
  last_name: string | null
  language_code: string | null
  photo_url: string | null
  allows_write_to_pm: boolean
}

type CustomerRow = { id: string; full_name: string; phone: string; email: string | null }
type VehicleRow = {
  id: string
  make_model: string
  vehicle_category_id: string
  vehicle_type: string
  registration_number: string | null
}
type ReservationRow = {
  id: string
  reference: string
  status: BookingStatus | 'pending' | 'expired'
  starts_at: string | null
  ends_at: string | null
  estimated_total_cents: number
  estimated_total_min_cents: number | null
  estimated_total_max_cents: number | null
  vehicle_id: string
  vehicles: { make_model: string } | Array<{ make_model: string }>
  reservation_services: Array<{ service_id: string; service_name_snapshot: string }>
}

function one<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value
}

export async function upsertTelegramProfile(db: SupabaseServer, identity: TelegramIdentity): Promise<void> {
  await db.request('/rest/v1/rpc/upsert_verified_telegram_profile', {
    method: 'POST',
    body: JSON.stringify({
      p_telegram_user_id: identity.userId,
      p_username: identity.username ?? null,
      p_first_name: identity.firstName,
      p_last_name: identity.lastName ?? null,
      p_language_code: identity.languageCode ?? null,
      p_photo_url: identity.photoUrl ?? null,
      p_allows_write_to_pm: identity.allowsWriteToPm,
    }),
  })
}

export async function loadTelegramProfile(db: SupabaseServer, telegramUserId: string): Promise<TelegramProfile> {
  const profiles = await db.request<ProfileRow[]>(
    `/rest/v1/telegram_profiles?telegram_user_id=eq.${telegramUserId}&select=telegram_user_id,customer_id,username,first_name,last_name,language_code,photo_url,allows_write_to_pm&limit=1`,
  )
  const profile = profiles[0]
  if (!profile) throw new Error('TELEGRAM_PROFILE_NOT_FOUND')
  let customer: CustomerRow | undefined
  let vehicles: TelegramVehicle[] = []
  let bookings: TelegramBooking[] = []
  if (profile.customer_id) {
    const [customers, vehicleRows, reservationRows] = await Promise.all([
      db.request<CustomerRow[]>(`/rest/v1/customers?id=eq.${profile.customer_id}&select=id,full_name,phone,email&limit=1`),
      db.request<VehicleRow[]>(`/rest/v1/vehicles?customer_id=eq.${profile.customer_id}&select=id,make_model,vehicle_category_id,vehicle_type,registration_number&order=created_at.desc`),
      db.request<ReservationRow[]>(`/rest/v1/reservations?customer_id=eq.${profile.customer_id}&select=id,reference,status,starts_at,ends_at,estimated_total_cents,estimated_total_min_cents,estimated_total_max_cents,vehicle_id,vehicles(make_model),reservation_services(service_id,service_name_snapshot)&order=starts_at.desc.nullslast,created_at.desc&limit=100`),
    ])
    customer = customers[0]
    vehicles = vehicleRows.map((vehicle) => ({
      id: vehicle.id,
      makeModel: vehicle.make_model,
      vehicleCategoryId: vehicle.vehicle_category_id,
      vehicleType: vehicle.vehicle_type,
      registrationNumber: vehicle.registration_number ?? undefined,
    }))
    bookings = reservationRows.map((reservation) => ({
      id: reservation.id,
      reference: reservation.reference,
      status: reservation.status,
      start: reservation.starts_at ?? undefined,
      end: reservation.ends_at ?? undefined,
      estimatedPriceMinCents: reservation.estimated_total_min_cents ?? reservation.estimated_total_cents,
      estimatedPriceMaxCents: reservation.estimated_total_max_cents ?? reservation.estimated_total_cents,
      vehicleId: reservation.vehicle_id,
      vehicle: one(reservation.vehicles)?.make_model ?? '',
      serviceIds: reservation.reservation_services.map((service) => service.service_id),
      services: reservation.reservation_services.map((service) => service.service_name_snapshot),
    }))
  }
  return {
    userId: String(profile.telegram_user_id),
    firstName: profile.first_name,
    lastName: profile.last_name ?? undefined,
    username: profile.username ?? undefined,
    language: telegramLanguage(profile.language_code ?? undefined),
    photoUrl: profile.photo_url ?? undefined,
    allowsWriteToPm: profile.allows_write_to_pm,
    linked: Boolean(customer),
    customer: customer ? {
      fullName: customer.full_name,
      phone: customer.phone,
      email: customer.email ?? undefined,
    } : undefined,
    vehicles,
    bookings,
  }
}

export async function loadTelegramBookingIdentity(db: SupabaseServer, telegramUserId: string) {
  const profile = await loadTelegramProfile(db, telegramUserId)
  return {
    profile,
    contact: profile.customer,
  }
}

export async function loadOwnedVehicle(db: SupabaseServer, telegramUserId: string, vehicleId: string): Promise<TelegramVehicle> {
  const profiles = await db.request<Array<{ customer_id: string | null }>>(
    `/rest/v1/telegram_profiles?telegram_user_id=eq.${telegramUserId}&select=customer_id&limit=1`,
  )
  if (!profiles[0]?.customer_id) throw new Error('TELEGRAM_CUSTOMER_REQUIRED')
  const rows = await db.request<VehicleRow[]>(
    `/rest/v1/vehicles?id=eq.${vehicleId}&customer_id=eq.${profiles[0].customer_id}&select=id,make_model,vehicle_category_id,vehicle_type,registration_number&limit=1`,
  )
  const vehicle = rows[0]
  if (!vehicle) throw new Error('TELEGRAM_VEHICLE_NOT_OWNED')
  return {
    id: vehicle.id,
    makeModel: vehicle.make_model,
    vehicleCategoryId: vehicle.vehicle_category_id,
    vehicleType: vehicle.vehicle_type,
    registrationNumber: vehicle.registration_number ?? undefined,
  }
}

async function activeVehicleCategory(db: SupabaseServer, categoryId: string): Promise<{ code: string }> {
  const categories = await db.request<Array<{ code: string }>>(
    `/rest/v1/vehicle_categories?id=eq.${categoryId}&is_active=eq.true&select=code&limit=1`,
  )
  if (!categories[0]) throw new Error('UNKNOWN_VEHICLE_CATEGORY')
  return categories[0]
}

export async function saveTelegramVehicle(db: SupabaseServer, telegramUserId: string, input: {
  id?: string
  makeModel: string
  vehicleCategoryId: string
  registrationNumber?: string
}): Promise<void> {
  const profiles = await db.request<Array<{ customer_id: string | null }>>(
    `/rest/v1/telegram_profiles?telegram_user_id=eq.${telegramUserId}&select=customer_id&limit=1`,
  )
  const customerId = profiles[0]?.customer_id
  if (!customerId) throw new Error('TELEGRAM_CUSTOMER_REQUIRED')
  const category = await activeVehicleCategory(db, input.vehicleCategoryId)
  const payload = {
    make_model: input.makeModel,
    vehicle_category_id: input.vehicleCategoryId,
    vehicle_type: category.code,
    registration_number: input.registrationNumber || null,
    normalized_registration: input.registrationNumber?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || null,
    updated_at: new Date().toISOString(),
  }
  if (input.id) {
    const rows = await db.request<Array<{ id: string }>>(`/rest/v1/vehicles?id=eq.${input.id}&customer_id=eq.${customerId}&select=id`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload),
    })
    if (!rows[0]) throw new Error('TELEGRAM_VEHICLE_NOT_OWNED')
    return
  }
  await db.request('/rest/v1/vehicles', {
    method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ...payload, customer_id: customerId }),
  })
}

export async function setTelegramWriteAccess(db: SupabaseServer, telegramUserId: string, granted: boolean, reference?: string): Promise<void> {
  await db.request(`/rest/v1/telegram_profiles?telegram_user_id=eq.${telegramUserId}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
      allows_write_to_pm: granted,
      write_access_granted_at: granted ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }),
  })
  if (!granted || !reference) return
  const profiles = await db.request<Array<{ customer_id: string | null; language_code: string | null }>>(
    `/rest/v1/telegram_profiles?telegram_user_id=eq.${telegramUserId}&select=customer_id,language_code&limit=1`,
  )
  if (!profiles[0]?.customer_id) return
  const reservations = await db.request<Array<{ id: string; language: BookingLanguage }>>(
    `/rest/v1/reservations?reference=eq.${encodeURIComponent(reference)}&customer_id=eq.${profiles[0].customer_id}&select=id,language&limit=1`,
  )
  if (!reservations[0]) return
  await db.request('/rest/v1/notification_outbox?on_conflict=idempotency_key', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({
      reservation_id: reservations[0].id,
      event_type: 'booking_requested',
      audience: 'customer',
      recipient: telegramUserId,
      language: reservations[0].language,
      channel: 'telegram',
      idempotency_key: `${reservations[0].id}:booking_requested:telegram:${telegramUserId}`,
    }),
  })
}

export async function setTelegramLanguage(db: SupabaseServer, telegramUserId: string, language: BookingLanguage): Promise<void> {
  await db.request(`/rest/v1/telegram_profiles?telegram_user_id=eq.${telegramUserId}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ language_code: language, updated_at: new Date().toISOString() }),
  })
}

export async function updateTelegramBotDelivery(db: SupabaseServer, updateId: number, status: 'sent' | 'failed' | 'ignored', error?: string): Promise<void> {
  await db.request(`/rest/v1/telegram_bot_updates?update_id=eq.${updateId}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
      status,
      last_error: error?.slice(0, 500) ?? null,
      processed_at: status === 'failed' ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  })
}
