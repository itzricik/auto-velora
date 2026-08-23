import { reference as createReference } from './reference'
import { inFilter, SupabaseError, type Database } from './supabase'
import { date, integer, startTime, text, uuid } from './validation'

type ReservationStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'expired' | 'no_show'
type ReservationRow = { id: string; reference: string; customer_id: string; vehicle_id: string; preferred_date: string; confirmed_date: string | null; status: ReservationStatus; work_bay_id: string | null; starts_at: string | null; ends_at: string | null; calculated_duration_minutes: number | null; final_duration_minutes: number | null; estimated_total_cents: number; estimated_total_min_cents: number | null; estimated_total_max_cents: number | null; calculated_duration_min_minutes: number | null; calculated_duration_max_minutes: number | null; final_total_cents: number | null; customer_message: string | null; internal_notes: string | null; price_override_reason: string | null; duration_override_reason: string | null; checklist_override_reason: string | null; language: 'en' | 'lv' | 'ru'; source: string; capacity_released_at: string | null; created_at: string }
type CustomerRow = { id: string; full_name: string; phone: string; email: string | null; normalized_phone: string; normalized_email: string; internal_notes: string | null; created_at: string }
type VehicleRow = { id: string; make_model: string; vehicle_type: string; vehicle_category_id: string; registration_number: string | null; applied_protection: string | null; recommended_maintenance_date: string | null; internal_notes: string | null }
type ItemRow = { reservation_id: string; service_id: string; service_name_snapshot: string; base_price_cents_snapshot: number; calculated_price_cents_snapshot: number; duration_minutes_snapshot: number | null }
type SegmentRow = { id: string; reservation_id: string; work_bay_id: string; segment_start: string; segment_end: string; duration_minutes: number; occupies_capacity: boolean }
type HistoryRow = { id: string; reservation_id: string; changed_by: string | null; action: string; old_value: Record<string, unknown> | null; new_value: Record<string, unknown> | null; created_at: string }
type BlockRow = { id: string; work_bay_id: string | null; starts_at: string; ends_at: string; reason: string }
type ConditionRow = { reservation_id: string; condition_level_id: string; condition_code_snapshot: string; condition_label_snapshot: string; indicator_snapshots: Array<{ id: string; code: string; label: string }>; total_min_surcharge_cents: number; total_max_surcharge_cents: number; total_min_duration_minutes: number; total_max_duration_minutes: number; customer_notes: string | null; admin_notes: string | null }
type MediaRow = { id: string; reservation_id: string; storage_path: string; original_filename: string; mime_type: string; file_size: number; media_type: 'reference' | 'before' | 'after'; uploaded_by_type: string; created_at: string }
type ChecklistRow = { id: string; reservation_id: string; label_snapshot: string; is_required: boolean; is_completed: boolean; completed_by: string | null; completed_at: string | null; note: string | null; sort_order: number }

export type ServiceRow = { id: string; slug: string; name_en: string; name_lv: string; name_ru: string; base_price_cents: number; base_duration_minutes: number; buffer_minutes: number; is_active: boolean }
export type CategoryRow = { id: string; code: string; name_en: string; price_multiplier: number; duration_multiplier: number }
export type BayRow = { id: string; code: string; name: string; is_active: boolean; sort_order: number }
export type ConditionRuleRow = { id: string; code: string; label_en: string; label_lv: string; label_ru: string; explanation_en: string; explanation_lv: string; explanation_ru: string; min_surcharge_cents: number; max_surcharge_cents: number; min_duration_minutes: number; max_duration_minutes: number; is_active: boolean; sort_order: number; requires_business_confirmation: boolean }

async function assemble(db: Database, reservations: ReservationRow[], includeHistory = false) {
  if (!reservations.length) return []
  const reservationIds = reservations.map((row) => row.id)
  const customerIds = [...new Set(reservations.map((row) => row.customer_id))]
  const vehicleIds = [...new Set(reservations.map((row) => row.vehicle_id))]
  const [customers, vehicles, items, segments, history, conditions, media, checklist] = await Promise.all([
    db.request<CustomerRow[]>(`/rest/v1/customers?id=${inFilter(customerIds)}&select=id,full_name,phone,email,normalized_phone,normalized_email,internal_notes,created_at`),
    db.request<VehicleRow[]>(`/rest/v1/vehicles?id=${inFilter(vehicleIds)}&select=id,make_model,vehicle_type,vehicle_category_id,registration_number,applied_protection,recommended_maintenance_date,internal_notes`),
    db.request<ItemRow[]>(`/rest/v1/reservation_services?reservation_id=${inFilter(reservationIds)}&select=reservation_id,service_id,service_name_snapshot,base_price_cents_snapshot,calculated_price_cents_snapshot,duration_minutes_snapshot`),
    db.request<SegmentRow[]>(`/rest/v1/reservation_segments?reservation_id=${inFilter(reservationIds)}&select=id,reservation_id,work_bay_id,segment_start,segment_end,duration_minutes,occupies_capacity&order=segment_start.asc`),
    includeHistory ? db.request<HistoryRow[]>(`/rest/v1/reservation_history?reservation_id=${inFilter(reservationIds)}&select=id,reservation_id,changed_by,action,old_value,new_value,created_at&order=created_at.desc`) : Promise.resolve([]),
    includeHistory ? db.request<ConditionRow[]>(`/rest/v1/reservation_conditions?reservation_id=${inFilter(reservationIds)}&select=reservation_id,condition_level_id,condition_code_snapshot,condition_label_snapshot,indicator_snapshots,total_min_surcharge_cents,total_max_surcharge_cents,total_min_duration_minutes,total_max_duration_minutes,customer_notes,admin_notes`) : Promise.resolve([]),
    includeHistory ? db.request<MediaRow[]>(`/rest/v1/reservation_media?reservation_id=${inFilter(reservationIds)}&upload_status=eq.ready&deleted_at=is.null&select=id,reservation_id,storage_path,original_filename,mime_type,file_size,media_type,uploaded_by_type,created_at&order=created_at.asc`) : Promise.resolve([]),
    includeHistory ? db.request<ChecklistRow[]>(`/rest/v1/reservation_checklist_items?reservation_id=${inFilter(reservationIds)}&select=id,reservation_id,label_snapshot,is_required,is_completed,completed_by,completed_at,note,sort_order&order=sort_order.asc`) : Promise.resolve([]),
  ])
  const customerMap = new Map(customers.map((row) => [row.id, row]))
  const vehicleMap = new Map(vehicles.map((row) => [row.id, row]))
  return reservations.map((reservation) => ({
    ...reservation,
    customer: customerMap.get(reservation.customer_id),
    vehicle: vehicleMap.get(reservation.vehicle_id),
    services: items.filter((item) => item.reservation_id === reservation.id),
    segments: segments.filter((segment) => segment.reservation_id === reservation.id),
    ...(includeHistory ? {
      history: history.filter((entry) => entry.reservation_id === reservation.id),
      condition: conditions.find((entry) => entry.reservation_id === reservation.id) ?? null,
      media: media.filter((entry) => entry.reservation_id === reservation.id),
      checklist: checklist.filter((entry) => entry.reservation_id === reservation.id),
    } : {}),
  }))
}

export async function catalog(db: Database) {
  const conditionSelect = 'id,code,label_en,label_lv,label_ru,explanation_en,explanation_lv,explanation_ru,min_surcharge_cents,max_surcharge_cents,min_duration_minutes,max_duration_minutes,is_active,sort_order,requires_business_confirmation'
  const [services, vehicleCategories, bays, conditionLevels, conditionIndicators] = await Promise.all([
    db.request<ServiceRow[]>('/rest/v1/services?active=eq.true&is_active=eq.true&select=id,slug,name_en,name_lv,name_ru,base_price_cents,base_duration_minutes,buffer_minutes,is_active&order=sort_order.asc'),
    db.request<CategoryRow[]>('/rest/v1/vehicle_categories?is_active=eq.true&select=id,code,name_en,price_multiplier,duration_multiplier&order=sort_order.asc'),
    db.request<BayRow[]>('/rest/v1/work_bays?select=id,code,name,is_active,sort_order&order=sort_order.asc,code.asc'),
    db.request<ConditionRuleRow[]>(`/rest/v1/condition_levels?is_active=eq.true&select=${conditionSelect}&order=sort_order.asc`),
    db.request<ConditionRuleRow[]>(`/rest/v1/condition_indicators?is_active=eq.true&select=${conditionSelect}&order=sort_order.asc`),
  ])
  return { services, vehicleCategories, bays, conditionLevels, conditionIndicators }
}

const reservationSelect = 'id,reference,customer_id,vehicle_id,preferred_date,confirmed_date,status,work_bay_id,starts_at,ends_at,calculated_duration_minutes,final_duration_minutes,estimated_total_cents,estimated_total_min_cents,estimated_total_max_cents,calculated_duration_min_minutes,calculated_duration_max_minutes,final_total_cents,customer_message,internal_notes,price_override_reason,duration_override_reason,checklist_override_reason,language,source,capacity_released_at,created_at'

export async function schedule(db: Database, scheduleDate: string) {
  await db.request('/rest/v1/rpc/expire_pending_reservations', { method: 'POST', body: '{}' })
  const rangeStartDate = new Date(`${scheduleDate}T00:00:00.000Z`); rangeStartDate.setUTCDate(rangeStartDate.getUTCDate() - 1)
  const rangeStart = rangeStartDate.toISOString()
  const next = new Date(`${scheduleDate}T00:00:00.000Z`); next.setUTCDate(next.getUTCDate() + 1)
  const rangeEnd = next.toISOString()
  const [segments, blocks, businessHours, exception, schedulingRows, catalogData] = await Promise.all([
    db.request<SegmentRow[]>(`/rest/v1/reservation_segments?occupies_capacity=eq.true&segment_start=lt.${encodeURIComponent(rangeEnd)}&segment_end=gt.${encodeURIComponent(rangeStart)}&select=id,reservation_id,work_bay_id,segment_start,segment_end,duration_minutes,occupies_capacity&order=segment_start.asc`),
    db.request<BlockRow[]>(`/rest/v1/blocked_periods?starts_at=lt.${encodeURIComponent(rangeEnd)}&ends_at=gt.${encodeURIComponent(rangeStart)}&select=id,work_bay_id,starts_at,ends_at,reason&order=starts_at.asc`),
    db.request<Array<{ weekday: number; opens_at: string | null; closes_at: string | null; is_closed: boolean }>>('/rest/v1/business_hours?select=weekday,opens_at,closes_at,is_closed&order=weekday.asc'),
    db.request<Array<{ exception_date: string; opens_at: string | null; closes_at: string | null; is_closed: boolean; note: string | null }>>(`/rest/v1/business_hour_exceptions?exception_date=eq.${scheduleDate}&select=exception_date,opens_at,closes_at,is_closed,note&limit=1`),
    db.request<Array<{ start_interval_minutes: number }>>('/rest/v1/scheduling_settings?singleton=eq.true&select=start_interval_minutes&limit=1'),
    catalog(db),
  ])
  const reservationIds = [...new Set(segments.map((segment) => segment.reservation_id))]
  const reservations = reservationIds.length ? await db.request<ReservationRow[]>(`/rest/v1/reservations?id=${inFilter(reservationIds)}&select=${reservationSelect}`) : []
  const details = await assemble(db, reservations)
  const byId = new Map(details.map((item) => [item.id, item]))
  return {
    segments: segments.map((segment) => ({ ...segment, reservation: byId.get(segment.reservation_id) })),
    blocks, businessHours, exception: exception[0] ?? null,
    startIntervalMinutes: schedulingRows[0]?.start_interval_minutes ?? 30,
    ...catalogData,
  }
}

export async function newRequests(db: Database, search: string) {
  const reservations = await db.request<ReservationRow[]>(`/rest/v1/reservations?status=in.(pending,expired)&source=eq.public_website&select=${reservationSelect}&order=created_at.desc&limit=200`)
  const details = await assemble(db, reservations)
  const query = search.trim().toLocaleLowerCase('en')
  if (!query) return details
  return details.filter((item) => [item.reference, item.customer?.full_name, item.customer?.phone, item.customer?.email, item.vehicle?.make_model, item.vehicle?.registration_number].some((value) => value?.toLocaleLowerCase('en').includes(query)))
}

export async function reservation(db: Database, id: string) {
  const rows = await db.request<ReservationRow[]>(`/rest/v1/reservations?id=eq.${id}&select=${reservationSelect}&limit=1`)
  const detail = (await assemble(db, rows, true))[0] ?? null
  if (!detail) return null
  const relatedRows = await db.request<ReservationRow[]>(`/rest/v1/reservations?customer_id=eq.${detail.customer_id}&select=${reservationSelect}&order=created_at.desc&limit=100`)
  const relatedIds = relatedRows.map((row) => row.id)
  const filters = [
    detail.customer?.normalized_phone ? `normalized_phone.eq.${encodeURIComponent(detail.customer.normalized_phone)}` : '',
    detail.customer?.normalized_email ? `normalized_email.eq.${encodeURIComponent(detail.customer.normalized_email)}` : '',
  ].filter(Boolean)
  const [relatedDetails, relatedConditions, relatedMedia, possibleDuplicates] = await Promise.all([
    assemble(db, relatedRows),
    relatedIds.length ? db.request<ConditionRow[]>(`/rest/v1/reservation_conditions?reservation_id=${inFilter(relatedIds)}&select=reservation_id,condition_level_id,condition_code_snapshot,condition_label_snapshot,indicator_snapshots,total_min_surcharge_cents,total_max_surcharge_cents,total_min_duration_minutes,total_max_duration_minutes,customer_notes,admin_notes`) : Promise.resolve([]),
    relatedIds.length ? db.request<Array<{ reservation_id: string; media_type: string }>>(`/rest/v1/reservation_media?reservation_id=${inFilter(relatedIds)}&upload_status=eq.ready&deleted_at=is.null&select=reservation_id,media_type`) : Promise.resolve([]),
    filters.length ? db.request<CustomerRow[]>(`/rest/v1/customers?id=neq.${detail.customer_id}&or=(${filters.join(',')})&anonymized_at=is.null&select=id,full_name,phone,email,normalized_phone,normalized_email,internal_notes,created_at&limit=20`) : Promise.resolve([]),
  ])
  return {
    ...detail,
    possibleDuplicates,
    customerHistory: relatedDetails.map((entry) => ({
      ...entry,
      conditionSummary: relatedConditions.find((condition) => condition.reservation_id === entry.id)?.condition_label_snapshot ?? null,
      beforePhotoCount: relatedMedia.filter((mediaItem) => mediaItem.reservation_id === entry.id && mediaItem.media_type === 'before').length,
      afterPhotoCount: relatedMedia.filter((mediaItem) => mediaItem.reservation_id === entry.id && mediaItem.media_type === 'after').length,
    })),
  }
}

export async function updateChecklist(db: Database, actorId: string, source: Record<string, unknown>) {
  const row = await db.request<ChecklistRow>('/rest/v1/rpc/complete_checklist_item', {
    method: 'POST',
    body: JSON.stringify({
      p_actor: actorId,
      p_item_id: uuid(source.itemId),
      p_completed: source.completed === true,
      p_note: text(source.note, 1000) || null,
    }),
  })
  if (!row?.id) throw new Error('NOT_FOUND')
  return row
}

export async function addChecklistItem(db: Database, actorId: string, source: Record<string, unknown>) {
  const reservationId = uuid(source.reservationId)
  const label = text(source.label, 200)
  if (label.length < 2) throw new Error('VALIDATION_FAILED')
  const rows = await db.request<Array<{ sort_order: number }>>(`/rest/v1/reservation_checklist_items?reservation_id=eq.${reservationId}&select=sort_order&order=sort_order.desc&limit=1`)
  await db.request('/rest/v1/reservation_checklist_items', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ reservation_id: reservationId, label_snapshot: label, is_required: source.required === true, sort_order: (rows[0]?.sort_order ?? 0) + 10 }),
  })
  await db.request('/rest/v1/reservation_history', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ reservation_id: reservationId, changed_by: actorId, action: 'checklist_item_added', new_value: { label, required: source.required === true } }),
  })
  return true
}

export async function mediaRecord(db: Database, mediaId: string) {
  const rows = await db.request<MediaRow[]>(`/rest/v1/reservation_media?id=eq.${mediaId}&deleted_at=is.null&select=id,reservation_id,storage_path,original_filename,mime_type,file_size,media_type,uploaded_by_type,created_at&limit=1`)
  return rows[0] ?? null
}

export async function historySearch(db: Database, search: string) {
  const rows = await db.request<ReservationRow[]>(`/rest/v1/reservations?select=${reservationSelect}&order=created_at.desc&limit=300`)
  const details = await assemble(db, rows)
  const query = search.trim().toLocaleLowerCase('en')
  if (!query) return details.slice(0, 100)
  return details.filter((item) => [item.reference, item.customer?.full_name, item.customer?.phone, item.customer?.email, item.vehicle?.make_model, item.vehicle?.registration_number].some((value) => value?.toLocaleLowerCase('en').includes(query))).slice(0, 100)
}

function parseSaveInput(source: Record<string, unknown>) {
  const reservationId = source.reservationId ? uuid(source.reservationId) : undefined
  const fullName = text(source.fullName, 100); const phone = text(source.phone, 32); const email = text(source.email, 254).toLowerCase()
  const vehicleCategoryId = uuid(source.vehicleCategoryId); const vehicleDescription = text(source.vehicleDescription, 120)
  const preferredDate = date(source.preferredDate)
  const requestedStartText = text(source.requestedStart, 50)
  const requestedStartMs = requestedStartText ? Date.parse(requestedStartText) : Number.NaN
  if (requestedStartText && Number.isNaN(requestedStartMs)) throw new Error('VALIDATION_FAILED')
  const requestedStart = requestedStartText ? new Date(requestedStartMs).toISOString() : null
  const workBayId = source.workBayId ? uuid(source.workBayId) : null
  const status = text(source.status, 30) as ReservationStatus; const language = text(source.language, 2)
  const reservationSource = text(source.source, 20)
  const finalTotalCents = source.finalTotalCents == null ? null : integer(source.finalTotalCents, 0, 100_000_000)
  const finalDurationMinutes = source.finalDurationMinutes == null ? null : integer(source.finalDurationMinutes, 5, 100_000)
  const conditionLevelId = uuid(source.conditionLevelId)
  const conditionIndicatorIds = Array.isArray(source.conditionIndicatorIds) ? [...new Set(source.conditionIndicatorIds.map(uuid))] : []
  const customerMessage = text(source.customerMessage, 1500); const internalNotes = text(source.internalNotes, 5000)
  const conditionNotes = text(source.conditionNotes, 2000)
  const priceOverrideReason = text(source.priceOverrideReason, 1000)
  const durationOverrideReason = text(source.durationOverrideReason, 1000)
  const checklistOverrideReason = text(source.checklistOverrideReason, 1000)
  const serviceIds = Array.isArray(source.serviceIds) ? [...new Set(source.serviceIds.map(uuid))] : []
  if (fullName.length < 2 || phone.replace(/\D/g, '').length < 8 || vehicleDescription.length < 2 || !serviceIds.length || !['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'expired', 'no_show'].includes(status) || !['en', 'lv', 'ru'].includes(language) || !['admin', 'phone', 'walk_in'].includes(reservationSource)) throw new Error('VALIDATION_FAILED')
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('VALIDATION_FAILED')
  if (!['pending', 'cancelled', 'no_show'].includes(status) && !requestedStart) throw new Error('VALIDATION_FAILED')
  if (conditionIndicatorIds.length > 8) throw new Error('VALIDATION_FAILED')
  return { reservationId, fullName, phone, email, vehicleCategoryId, vehicleDescription, preferredDate, requestedStart, workBayId, status, language, reservationSource, finalTotalCents, finalDurationMinutes, customerMessage, internalNotes, serviceIds, conditionLevelId, conditionIndicatorIds, conditionNotes, priceOverrideReason, durationOverrideReason, checklistOverrideReason }
}

function conditionSnapshot(
  level: ConditionRuleRow,
  indicators: ConditionRuleRow[],
  language: 'en' | 'lv' | 'ru',
  notes: string,
) {
  const label = (rule: ConditionRuleRow) => language === 'lv' ? rule.label_lv : language === 'ru' ? rule.label_ru : rule.label_en
  return {
    level_id: level.id,
    level_code: level.code,
    level_label: label(level),
    level_min_surcharge_cents: level.min_surcharge_cents,
    level_max_surcharge_cents: level.max_surcharge_cents,
    level_min_duration_minutes: level.min_duration_minutes,
    level_max_duration_minutes: level.max_duration_minutes,
    indicators: indicators.map((rule) => ({
      id: rule.id, code: rule.code, label: label(rule),
      min_surcharge_cents: rule.min_surcharge_cents,
      max_surcharge_cents: rule.max_surcharge_cents,
      min_duration_minutes: rule.min_duration_minutes,
      max_duration_minutes: rule.max_duration_minutes,
    })),
    total_min_surcharge_cents: level.min_surcharge_cents + indicators.reduce((sum, rule) => sum + rule.min_surcharge_cents, 0),
    total_max_surcharge_cents: level.max_surcharge_cents + indicators.reduce((sum, rule) => sum + rule.max_surcharge_cents, 0),
    total_min_duration_minutes: level.min_duration_minutes + indicators.reduce((sum, rule) => sum + rule.min_duration_minutes, 0),
    total_max_duration_minutes: level.max_duration_minutes + indicators.reduce((sum, rule) => sum + rule.max_duration_minutes, 0),
    customer_notes: undefined as string | undefined,
    admin_notes: notes,
  }
}

export async function save(db: Database, actorId: string, source: Record<string, unknown>) {
  const input = parseSaveInput(source)
  const [catalogData, current] = await Promise.all([catalog(db), input.reservationId ? reservation(db, input.reservationId) : Promise.resolve(null)])
  if (input.reservationId && !current) throw new Error('NOT_FOUND')
  const category = catalogData.vehicleCategories.find((item) => item.id === input.vehicleCategoryId)
  const selected = input.serviceIds.map((id) => catalogData.services.find((service) => service.id === id))
  const selectedLevel = catalogData.conditionLevels.find((item) => item.id === input.conditionLevelId)
  const selectedIndicators = input.conditionIndicatorIds.map((id) => catalogData.conditionIndicators.find((item) => item.id === id))
  if (!category || selected.some((service) => !service) || !selectedLevel || selectedIndicators.some((item) => !item) || (input.workBayId && !catalogData.bays.some((bay) => bay.id === input.workBayId && bay.is_active))) throw new Error('INVALID_CATALOG_SELECTION')
  const services = selected as ServiceRow[]
  const calculated = services.map((service) => ({
    service_id: service.id, service_name: service.name_en, base_price_cents: service.base_price_cents,
    calculated_price_cents: Math.round(service.base_price_cents * Number(category.price_multiplier)),
    duration_minutes: service.base_duration_minutes,
    buffer_minutes: service.buffer_minutes,
  }))
  const snapshot = conditionSnapshot(selectedLevel, selectedIndicators as ConditionRuleRow[], input.language as 'en' | 'lv' | 'ru', input.conditionNotes)
  snapshot.customer_notes = current?.condition?.customer_notes ?? undefined
  const baseEstimate = calculated.reduce((sum, service) => sum + service.calculated_price_cents, 0)
  const estimate = baseEstimate + snapshot.total_min_surcharge_cents
  const baseDuration = Math.ceil(services.reduce((sum, service) => sum + service.base_duration_minutes + service.buffer_minutes, 0) * Number(category.duration_multiplier))
  const duration = baseDuration + snapshot.total_max_duration_minutes
  if (input.finalTotalCents != null && Math.abs(input.finalTotalCents - estimate) > Math.max(5000, Math.round(estimate * .2)) && input.priceOverrideReason.length < 3) throw new Error('PRICE_OVERRIDE_REASON_REQUIRED')
  if (input.finalDurationMinutes != null && Math.abs(input.finalDurationMinutes - duration) > Math.max(60, Math.round(duration * .2)) && input.durationOverrideReason.length < 3) throw new Error('DURATION_OVERRIDE_REASON_REQUIRED')
  const payload = {
    p_actor: actorId, p_reservation_id: input.reservationId ?? null, p_reference: current?.reference ?? createReference(),
    p_full_name: input.fullName, p_phone: input.phone, p_email: input.email, p_vehicle_category_id: input.vehicleCategoryId,
    p_vehicle_description: input.vehicleDescription, p_preferred_date: input.preferredDate,
    p_requested_start: input.requestedStart, p_work_bay_id: input.workBayId, p_status: input.status,
    p_estimated_total_cents: estimate, p_final_total_cents: input.finalTotalCents,
    p_calculated_duration_minutes: duration, p_customer_message: input.customerMessage,
    p_final_duration_minutes: input.finalDurationMinutes,
    p_internal_notes: input.internalNotes, p_language: input.language,
    p_source: current?.source === 'public_website' ? 'public_website' : input.reservationSource,
    p_vehicle_snapshot: { code: category.code, multiplier: Number(category.price_multiplier) }, p_service_snapshots: calculated,
    p_price_override_reason: input.priceOverrideReason || null,
    p_duration_override_reason: input.durationOverrideReason || null,
    p_checklist_override_reason: input.checklistOverrideReason || null,
    p_condition_snapshot: snapshot,
  }
  try {
    const result = await db.request<Array<{ reservation_id: string; reference: string; status: ReservationStatus }>>('/rest/v1/rpc/admin_save_duration_reservation_v4', { method: 'POST', body: JSON.stringify(payload) })
    if (!result[0]) throw new Error('SAVE_FAILED')
    return { reservationId: result[0].reservation_id, reference: result[0].reference, status: result[0].status }
  } catch (error) {
    if (error instanceof SupabaseError && error.code === 'P0001' && error.details?.includes('CHECKLIST_INCOMPLETE')) throw new Error('CHECKLIST_INCOMPLETE')
    if (error instanceof SupabaseError && (error.code === '23P01' || error.code === 'P0001')) throw new Error('SLOT_CONFLICT')
    throw error
  }
}

export async function preview(db: Database, actorId: string, source: Record<string, unknown>) {
  const vehicleCategoryId = uuid(source.vehicleCategoryId)
  const serviceIds = Array.isArray(source.serviceIds) ? [...new Set(source.serviceIds.map(uuid))] : []
  const requestedStartText = text(source.requestedStart, 50)
  const requestedStartMs = Date.parse(requestedStartText)
  const workBayId = source.workBayId ? uuid(source.workBayId) : null
  const reservationId = source.reservationId ? uuid(source.reservationId) : null
  const finalDurationMinutes = source.finalDurationMinutes == null ? null : integer(source.finalDurationMinutes, 5, 100_000)
  const conditionLevelId = uuid(source.conditionLevelId)
  const conditionIndicatorIds = Array.isArray(source.conditionIndicatorIds) ? [...new Set(source.conditionIndicatorIds.map(uuid))] : []
  if (!serviceIds.length || Number.isNaN(requestedStartMs)) throw new Error('VALIDATION_FAILED')
  const catalogData = await catalog(db)
  const category = catalogData.vehicleCategories.find((item) => item.id === vehicleCategoryId)
  const services = serviceIds.map((id) => catalogData.services.find((service) => service.id === id))
  const conditionLevel = catalogData.conditionLevels.find((item) => item.id === conditionLevelId)
  const conditionIndicators = conditionIndicatorIds.map((id) => catalogData.conditionIndicators.find((item) => item.id === id))
  if (!category || services.some((service) => !service) || !conditionLevel || conditionIndicators.some((item) => !item)) throw new Error('INVALID_CATALOG_SELECTION')
  const conditionDuration = conditionLevel.max_duration_minutes + (conditionIndicators as ConditionRuleRow[]).reduce((sum, item) => sum + item.max_duration_minutes, 0)
  const duration = finalDurationMinutes ?? Math.ceil((services as ServiceRow[]).reduce(
    (sum, service) => sum + service.base_duration_minutes + service.buffer_minutes, 0,
  ) * Number(category.duration_multiplier)) + conditionDuration
  return db.request<{
    workBayId: string
    start: string
    end: string
    durationMinutes: number
    availableBayCount: number
    segments: Array<{ work_bay_id: string; segment_start: string; segment_end: string; duration_minutes: number }>
  } | null>('/rest/v1/rpc/admin_scheduling_preview', {
    method: 'POST',
    body: JSON.stringify({
      p_actor: actorId,
      p_duration_minutes: duration,
      p_requested_start: new Date(requestedStartMs).toISOString(),
      p_work_bay_id: workBayId,
      p_reservation_id: reservationId,
    }),
  })
}

export async function releaseRemainingCapacity(db: Database, actorId: string, source: Record<string, unknown>) {
  await db.request('/rest/v1/rpc/admin_release_reservation_capacity', {
    method: 'POST',
    body: JSON.stringify({ p_actor: actorId, p_reservation_id: uuid(source.reservationId) }),
  })
  return true
}

function rigaTimestamp(localDate: string, localTime: string) {
  const [hours, minutes] = localTime.split(':').map(Number)
  const rough = new Date(`${localDate}T${localTime}:00.000Z`)
  const shown = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Riga', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(rough).split(':').map(Number)
  return new Date(rough.getTime() + ((hours * 60 + minutes) - (shown[0] * 60 + shown[1])) * 60_000)
}

export async function block(db: Database, _actorId: string, source: Record<string, unknown>) {
  const slotDate = date(source.slotDate); const time = startTime(source.startTime); const duration = integer(source.durationMinutes, 30, 600)
  const workBayId = uuid(source.workBayId); const reason = text(source.reason, 500)
  if (!reason) throw new Error('VALIDATION_FAILED')
  const startsAt = rigaTimestamp(slotDate, time); const endsAt = new Date(startsAt.getTime() + duration * 60_000)
  const rows = await db.request<BlockRow[]>('/rest/v1/blocked_periods?select=id,work_bay_id,starts_at,ends_at,reason', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ work_bay_id: workBayId, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), reason }),
  })
  return rows.length > 0
}

export async function unblock(db: Database, _actorId: string, source: Record<string, unknown>) {
  await db.request(`/rest/v1/blocked_periods?id=eq.${uuid(source.blockId)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  return true
}
