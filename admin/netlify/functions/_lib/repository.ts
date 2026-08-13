import { reference as createReference } from './reference'
import { inFilter, SupabaseError, type Database } from './supabase'
import { date, integer, startTime, text, uuid } from './validation'

type ReservationStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'

type ReservationRow = {
  id: string
  reference: string
  customer_id: string
  vehicle_id: string
  preferred_date: string
  confirmed_date: string | null
  status: ReservationStatus
  estimated_total_cents: number
  final_total_cents: number | null
  customer_message: string | null
  internal_notes: string | null
  language: 'en' | 'lv' | 'ru'
  created_at: string
}

type CustomerRow = { id: string; full_name: string; phone: string; email: string | null }
type VehicleRow = { id: string; make_model: string; vehicle_type: string; vehicle_category_id: string }
type ItemRow = { reservation_id: string; service_id: string; service_name_snapshot: string; base_price_cents_snapshot: number; calculated_price_cents_snapshot: number }
type SlotRow = { id: string; reservation_id: string | null; slot_date: string; start_time: string; end_time: string; status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'blocked'; block_reason: string | null }
type HistoryRow = { id: string; reservation_id: string; changed_by: string | null; action: string; old_value: Record<string, unknown> | null; new_value: Record<string, unknown> | null; created_at: string }

export type ServiceRow = { id: string; slug: string; name_en: string; name_lv: string; name_ru: string; base_price_cents: number; duration_slots: number }
export type CategoryRow = { id: string; code: string; name_en: string; price_multiplier: number }

async function assemble(db: Database, reservations: ReservationRow[], includeHistory = false) {
  if (!reservations.length) return []
  const reservationIds = reservations.map((row) => row.id)
  const customerIds = [...new Set(reservations.map((row) => row.customer_id))]
  const vehicleIds = [...new Set(reservations.map((row) => row.vehicle_id))]
  const [customers, vehicles, items, slots, history] = await Promise.all([
    db.request<CustomerRow[]>(`/rest/v1/customers?id=${inFilter(customerIds)}&select=id,full_name,phone,email`),
    db.request<VehicleRow[]>(`/rest/v1/vehicles?id=${inFilter(vehicleIds)}&select=id,make_model,vehicle_type,vehicle_category_id`),
    db.request<ItemRow[]>(`/rest/v1/reservation_services?reservation_id=${inFilter(reservationIds)}&select=reservation_id,service_id,service_name_snapshot,base_price_cents_snapshot,calculated_price_cents_snapshot`),
    db.request<SlotRow[]>(`/rest/v1/reservation_slots?reservation_id=${inFilter(reservationIds)}&status=neq.cancelled&select=id,reservation_id,slot_date,start_time,end_time,status,block_reason&order=start_time.asc`),
    includeHistory
      ? db.request<HistoryRow[]>(`/rest/v1/reservation_history?reservation_id=${inFilter(reservationIds)}&select=id,reservation_id,changed_by,action,old_value,new_value,created_at&order=created_at.desc`)
      : Promise.resolve([]),
  ])
  const customerMap = new Map(customers.map((row) => [row.id, row]))
  const vehicleMap = new Map(vehicles.map((row) => [row.id, row]))
  return reservations.map((reservation) => ({
    ...reservation,
    customer: customerMap.get(reservation.customer_id),
    vehicle: vehicleMap.get(reservation.vehicle_id),
    services: items.filter((item) => item.reservation_id === reservation.id),
    slots: slots.filter((slot) => slot.reservation_id === reservation.id),
    ...(includeHistory ? { history: history.filter((entry) => entry.reservation_id === reservation.id) } : {}),
  }))
}

export async function catalog(db: Database) {
  const [services, vehicleCategories] = await Promise.all([
    db.request<ServiceRow[]>('/rest/v1/services?active=eq.true&is_active=eq.true&select=id,slug,name_en,name_lv,name_ru,base_price_cents,duration_slots&order=sort_order.asc'),
    db.request<CategoryRow[]>('/rest/v1/vehicle_categories?is_active=eq.true&select=id,code,name_en,price_multiplier&order=sort_order.asc'),
  ])
  return { services, vehicleCategories }
}

export async function schedule(db: Database, slotDate: string) {
  const slots = await db.request<SlotRow[]>(
    `/rest/v1/reservation_slots?slot_date=eq.${slotDate}&status=in.(pending,confirmed,in_progress,completed,blocked)&select=id,reservation_id,slot_date,start_time,end_time,status,block_reason&order=start_time.asc`,
  )
  const reservationIds = [...new Set(slots.map((slot) => slot.reservation_id).filter((id): id is string => Boolean(id)))]
  const reservations = reservationIds.length
    ? await db.request<ReservationRow[]>(`/rest/v1/reservations?id=${inFilter(reservationIds)}&select=id,reference,customer_id,vehicle_id,preferred_date,confirmed_date,status,estimated_total_cents,final_total_cents,customer_message,internal_notes,language,created_at`)
    : []
  const details = await assemble(db, reservations)
  const detailMap = new Map(details.map((item) => [item.id, item]))
  return slots.map((slot) => ({ ...slot, reservation: slot.reservation_id ? detailMap.get(slot.reservation_id) ?? null : null }))
}

export async function newRequests(db: Database, search: string) {
  const reservations = await db.request<ReservationRow[]>(
    '/rest/v1/reservations?status=eq.pending&confirmed_date=is.null&select=id,reference,customer_id,vehicle_id,preferred_date,confirmed_date,status,estimated_total_cents,final_total_cents,customer_message,internal_notes,language,created_at&order=created_at.desc&limit=200',
  )
  const details = await assemble(db, reservations)
  const query = search.trim().toLocaleLowerCase('en')
  if (!query) return details
  return details.filter((item) => [
    item.reference,
    item.customer?.full_name,
    item.customer?.phone,
    item.customer?.email,
    item.vehicle?.make_model,
  ].some((value) => value?.toLocaleLowerCase('en').includes(query)))
}

export async function reservation(db: Database, id: string) {
  const rows = await db.request<ReservationRow[]>(
    `/rest/v1/reservations?id=eq.${id}&select=id,reference,customer_id,vehicle_id,preferred_date,confirmed_date,status,estimated_total_cents,final_total_cents,customer_message,internal_notes,language,created_at&limit=1`,
  )
  return (await assemble(db, rows, true))[0] ?? null
}

function parseSaveInput(source: Record<string, unknown>) {
  const reservationId = source.reservationId ? uuid(source.reservationId) : undefined
  const fullName = text(source.fullName, 100)
  const phone = text(source.phone, 32)
  const email = text(source.email, 254).toLowerCase()
  const vehicleCategoryId = uuid(source.vehicleCategoryId)
  const vehicleDescription = text(source.vehicleDescription, 120)
  const preferredDate = date(source.preferredDate)
  const confirmedDate = source.confirmedDate ? date(source.confirmedDate) : null
  const requestedStart = source.startTime ? startTime(source.startTime) : null
  const durationSlots = integer(source.durationSlots, 1, 6)
  const status = text(source.status, 30) as ReservationStatus
  const language = text(source.language, 2)
  const finalTotalCents = source.finalTotalCents === null || source.finalTotalCents === undefined ? null : integer(source.finalTotalCents, 0, 100_000_000)
  const customerMessage = text(source.customerMessage, 1500)
  const internalNotes = text(source.internalNotes, 5000)
  const serviceIds = Array.isArray(source.serviceIds) ? [...new Set(source.serviceIds.map(uuid))] : []
  if (fullName.length < 2 || phone.replace(/\D/g, '').length < 8 || vehicleDescription.length < 2 || !serviceIds.length
    || !['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'].includes(status)
    || !['en', 'lv', 'ru'].includes(language)) throw new Error('VALIDATION_FAILED')
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('VALIDATION_FAILED')
  if (!['cancelled', 'no_show'].includes(status) && (!confirmedDate || !requestedStart)) throw new Error('VALIDATION_FAILED')
  if (status === 'no_show' && !reservationId) throw new Error('VALIDATION_FAILED')
  return { reservationId, fullName, phone, email, vehicleCategoryId, vehicleDescription, preferredDate, confirmedDate, requestedStart, durationSlots, status, language, finalTotalCents, customerMessage, internalNotes, serviceIds }
}

export async function save(db: Database, actorId: string, source: Record<string, unknown>) {
  const input = parseSaveInput(source)
  const [catalogData, current] = await Promise.all([
    catalog(db),
    input.reservationId ? reservation(db, input.reservationId) : Promise.resolve(null),
  ])
  if (input.reservationId && !current) throw new Error('NOT_FOUND')
  const category = catalogData.vehicleCategories.find((item) => item.id === input.vehicleCategoryId)
  const selected = input.serviceIds.map((id) => catalogData.services.find((service) => service.id === id))
  if (!category || selected.some((service) => !service)) throw new Error('INVALID_CATALOG_SELECTION')
  const services = selected as ServiceRow[]
  const calculated = services.map((service) => ({
    service_id: service.id,
    service_name: service.name_en,
    base_price_cents: service.base_price_cents,
    calculated_price_cents: Math.round(service.base_price_cents * Number(category.price_multiplier)),
  }))
  const estimate = calculated.reduce((sum, service) => sum + service.calculated_price_cents, 0)
  const payload = {
    p_actor: actorId,
    p_reservation_id: input.reservationId ?? null,
    p_reference: current?.reference ?? createReference(),
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_email: input.email,
    p_vehicle_category_id: input.vehicleCategoryId,
    p_vehicle_description: input.vehicleDescription,
    p_preferred_date: input.preferredDate,
    p_confirmed_date: input.confirmedDate,
    p_start_time: input.requestedStart,
    p_duration_slots: input.durationSlots,
    p_status: input.status,
    p_estimated_total_cents: estimate,
    p_final_total_cents: input.finalTotalCents,
    p_customer_message: input.customerMessage,
    p_internal_notes: input.internalNotes,
    p_language: input.language,
    p_vehicle_snapshot: { code: category.code, multiplier: Number(category.price_multiplier) },
    p_service_snapshots: calculated,
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await db.request<Array<{ reservation_id: string; reference: string; status: ReservationStatus }>>(
        '/rest/v1/rpc/admin_save_reservation_transactional',
        { method: 'POST', body: JSON.stringify(attempt ? { ...payload, p_reference: createReference() } : payload) },
      )
      if (!result[0]) throw new Error('SAVE_FAILED')
      return { reservationId: result[0].reservation_id, reference: result[0].reference, status: result[0].status }
    } catch (error) {
      if (error instanceof SupabaseError && error.code === '23505') {
        if (!input.reservationId && attempt < 2) continue
        throw new Error('SLOT_CONFLICT')
      }
      throw error
    }
  }
  throw new Error('SAVE_FAILED')
}

export async function block(db: Database, actorId: string, source: Record<string, unknown>) {
  const rows = await db.request<SlotRow[]>('/rest/v1/rpc/admin_block_slots_transactional', {
    method: 'POST',
    body: JSON.stringify({
      p_actor: actorId,
      p_slot_date: date(source.slotDate),
      p_start_time: startTime(source.startTime),
      p_duration_slots: integer(source.durationSlots, 1, 6),
      p_reason: text(source.reason, 500),
    }),
  })
  return rows.length > 0
}

export async function unblock(db: Database, actorId: string, source: Record<string, unknown>) {
  return db.request<boolean>('/rest/v1/rpc/admin_unblock_slot', {
    method: 'POST',
    body: JSON.stringify({ p_actor: actorId, p_slot_id: uuid(source.slotId) }),
  })
}
