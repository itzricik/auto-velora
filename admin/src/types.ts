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
  best_for_en?: string | null
  best_for_lv?: string | null
  best_for_ru?: string | null
  included_work_en?: string[]
  included_work_lv?: string[]
  included_work_ru?: string[]
  protection_duration_en?: string | null
  protection_duration_lv?: string | null
  protection_duration_ru?: string | null
  recommended_condition_en?: string | null
  recommended_condition_lv?: string | null
  recommended_condition_ru?: string | null
}

export type ConditionRule = {
  id: string
  code: string
  label_en: string
  label_lv: string
  label_ru: string
  explanation_en: string
  explanation_lv: string
  explanation_ru: string
  min_surcharge_cents: number
  max_surcharge_cents: number
  min_duration_minutes: number
  max_duration_minutes: number
  is_active: boolean
  sort_order: number
  requires_business_confirmation: boolean
}

export type ServicePackage = {
  id: string
  code: string
  name_en: string
  package_price_cents: number
  base_duration_minutes: number
  buffer_minutes: number
  is_active: boolean
}

export type ChecklistTemplateItem = {
  id: string
  template_id: string
  label: string
  is_required: boolean
  sort_order: number
}

export type ChecklistTemplate = {
  id: string
  code: string
  name: string
  description: string
  is_default: boolean
  is_active: boolean
  items: ChecklistTemplateItem[]
  service_ids: string[]
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
  estimated_total_min_cents: number | null
  estimated_total_max_cents: number | null
  calculated_duration_min_minutes: number | null
  calculated_duration_max_minutes: number | null
  final_total_cents: number | null
  customer_message: string | null
  internal_notes: string | null
  price_override_reason: string | null
  duration_override_reason: string | null
  checklist_override_reason: string | null
  language: 'en' | 'lv' | 'ru'
  source: 'public_website' | 'admin' | 'phone' | 'walk_in' | 'legacy'
  customer: { id: string; full_name: string; phone: string; email: string | null; normalized_phone: string; normalized_email: string; internal_notes: string | null; created_at: string }
  vehicle: { id: string; make_model: string; vehicle_type: string; vehicle_category_id: string; registration_number: string | null; applied_protection: string | null; recommended_maintenance_date: string | null; internal_notes: string | null }
  services: ReservationService[]
  segments: ReservationSegment[]
  history?: Array<{ id: string; action: string; old_value: Record<string, unknown> | null; new_value: Record<string, unknown> | null; created_at: string; changed_by: string | null }>
  condition?: {
    condition_level_id: string
    condition_code_snapshot: string
    condition_label_snapshot: string
    indicator_snapshots: Array<{ id: string; code: string; label: string }>
    total_min_surcharge_cents: number
    total_max_surcharge_cents: number
    total_min_duration_minutes: number
    total_max_duration_minutes: number
    customer_notes: string | null
    admin_notes: string | null
  } | null
  media?: Array<{ id: string; storage_path: string; original_filename: string; mime_type: string; file_size: number; media_type: 'reference' | 'before' | 'after'; uploaded_by_type: string; created_at: string; signed_url: string }>
  checklist?: Array<{ id: string; label_snapshot: string; is_required: boolean; is_completed: boolean; completed_by: string | null; completed_at: string | null; note: string | null; sort_order: number }>
  customerHistory?: Array<{ id: string; reference: string; status: ReservationStatus; starts_at: string | null; preferred_date: string; final_total_cents: number | null; estimated_total_cents: number; vehicle: { make_model: string }; services: ReservationService[]; conditionSummary: string | null; beforePhotoCount: number; afterPhotoCount: number }>
  possibleDuplicates?: Array<{ id: string; full_name: string; phone: string; email: string | null; normalized_phone: string; normalized_email: string; created_at: string }>
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
  conditionLevelId: string
  conditionIndicatorIds: string[]
  conditionNotes: string
  priceOverrideReason: string
  durationOverrideReason: string
  checklistOverrideReason: string
}

export type BusinessConfiguration = {
  public_business_name: string
  legal_entity_name: string | null
  registration_number: string | null
  address: string | null
  phone: string | null
  email: string | null
  instagram_url: string | null
  whatsapp_url: string | null
  map_url: string | null
  review_url: string | null
  timezone: string
  privacy_contact: string | null
  reservation_retention_days: number | null
  cancellation_policy_en: string | null
  cancellation_policy_lv: string | null
  cancellation_policy_ru: string | null
  privacy_notice_en: string | null
  privacy_notice_lv: string | null
  privacy_notice_ru: string | null
  photo_processing_en: string | null
  photo_processing_lv: string | null
  photo_processing_ru: string | null
  booking_terms_en: string | null
  booking_terms_lv: string | null
  booking_terms_ru: string | null
}

export type SchedulePreview = {
  workBayId: string
  start: string
  end: string
  durationMinutes: number
  availableBayCount: number
  segments: Array<{ work_bay_id: string; segment_start: string; segment_end: string; duration_minutes: number }>
}
