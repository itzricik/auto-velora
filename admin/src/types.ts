export type ReservationStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'
export type SlotStatus = 'available' | 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'blocked'

export type Service = {
  id: string
  slug: string
  name_en: string
  name_lv: string
  name_ru: string
  base_price_cents: number
  duration_slots: number
}

export type VehicleCategory = {
  id: string
  code: string
  name_en: string
  price_multiplier: number
}

export type ReservationService = {
  service_id: string
  service_name_snapshot: string
  base_price_cents_snapshot: number
  calculated_price_cents_snapshot: number
}

export type Reservation = {
  id: string
  reference: string
  status: ReservationStatus
  preferred_date: string
  confirmed_date: string | null
  estimated_total_cents: number
  final_total_cents: number | null
  customer_message: string | null
  internal_notes: string | null
  language: 'en' | 'lv' | 'ru'
  customer: { full_name: string; phone: string; email: string | null }
  vehicle: { make_model: string; vehicle_type: string; vehicle_category_id: string }
  services: ReservationService[]
  slots: Array<{ id: string; start_time: string; end_time: string; status: Exclude<SlotStatus, 'available'> }>
  history?: Array<{
    id: string
    action: string
    old_value: Record<string, unknown> | null
    new_value: Record<string, unknown> | null
    created_at: string
    changed_by: string | null
  }>
}

export type OccupiedSlot = {
  id: string
  reservation_id: string | null
  slot_date: string
  start_time: string
  end_time: string
  status: Exclude<SlotStatus, 'available'>
  block_reason: string | null
  reservation: Reservation | null
}

export type ScheduleRow = {
  start: string
  end: string
  status: SlotStatus
  occupied: OccupiedSlot | null
}

export type AdminIdentity = {
  userId: string
  displayName: string
  role: 'admin' | 'staff'
}

export type ReservationInput = {
  reservationId?: string
  fullName: string
  phone: string
  email: string
  vehicleCategoryId: string
  vehicleDescription: string
  serviceIds: string[]
  preferredDate: string
  confirmedDate: string | null
  startTime: string | null
  durationSlots: number
  status: ReservationStatus
  finalTotalCents: number | null
  customerMessage: string
  internalNotes: string
  language: 'en' | 'lv' | 'ru'
}
