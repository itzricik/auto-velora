export type ReservationStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'expired' | 'no_show'

export type Service = {
  id: string
  slug: string
  name_en: string
  name_lv: string
  name_ru: string
  base_price_cents: number
  base_duration_minutes: number
  buffer_minutes: number
  is_active: boolean
}

export type ServicePackage = {
  id: string
  code: string
  name_en: string
  base_duration_minutes: number
  buffer_minutes: number
  is_active: boolean
}

export type SchedulingSettings = {
  start_interval_minutes: number
  pending_hold_minutes: number
}

export type VehicleCategory = {
  id: string
  code: string
  name_en: string
  price_multiplier: number
  duration_multiplier: number
}

export type WorkBay = { id: string; code: string; name: string; is_active: boolean; sort_order: number }
export type BusinessHours = { weekday: number; opens_at: string | null; closes_at: string | null; is_closed: boolean }
export type BusinessHoursException = { exception_date: string; opens_at: string | null; closes_at: string | null; is_closed: boolean; note: string | null }

export type ReservationService = {
  service_id: string
  service_name_snapshot: string
  base_price_cents_snapshot: number
  calculated_price_cents_snapshot: number
  duration_minutes_snapshot: number | null
}

export type ReservationSegment = {
  id: string
  reservation_id: string
  work_bay_id: string
  segment_start: string
  segment_end: string
  duration_minutes: number
  occupies_capacity: boolean
}

export type Reservation = {
  id: string
  reference: string
  status: ReservationStatus
  preferred_date: string
  confirmed_date: string | null
  work_bay_id: string | null
  starts_at: string | null
  ends_at: string | null
  calculated_duration_minutes: number | null
  final_duration_minutes: number | null
  estimated_total_cents: number
  final_total_cents: number | null
  customer_message: string | null
  internal_notes: string | null
  language: 'en' | 'lv' | 'ru'
  source: 'public_website' | 'admin' | 'phone' | 'walk_in' | 'legacy'
  customer: { full_name: string; phone: string; email: string | null }
  vehicle: { make_model: string; vehicle_type: string; vehicle_category_id: string }
  services: ReservationService[]
  segments: ReservationSegment[]
  history?: Array<{ id: string; action: string; old_value: Record<string, unknown> | null; new_value: Record<string, unknown> | null; created_at: string; changed_by: string | null }>
}

export type ScheduleSegment = ReservationSegment & { reservation: Reservation }
export type ScheduleBlock = { id: string; work_bay_id: string | null; starts_at: string; ends_at: string; reason: string }
export type BayCell = { status: 'available' | 'reservation' | 'blocked' | 'inactive'; segment: ScheduleSegment | null; block: ScheduleBlock | null }
export type ScheduleRow = { start: string; end: string; cells: Record<string, BayCell> }
export type AdminIdentity = { userId: string; displayName: string; role: 'admin' | 'staff' }

export type ReservationInput = {
  reservationId?: string
  fullName: string
  phone: string
  email: string
  vehicleCategoryId: string
  vehicleDescription: string
  serviceIds: string[]
  preferredDate: string
  requestedStart: string | null
  workBayId: string | null
  status: ReservationStatus
  finalTotalCents: number | null
  finalDurationMinutes: number | null
  customerMessage: string
  internalNotes: string
  language: 'en' | 'lv' | 'ru'
  source: 'admin' | 'phone' | 'walk_in'
}

export type SchedulePreview = {
  workBayId: string
  start: string
  end: string
  durationMinutes: number
  availableBayCount: number
  segments: Array<{ work_bay_id: string; segment_start: string; segment_end: string; duration_minutes: number }>
}
