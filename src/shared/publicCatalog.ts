import type { ConditionRule } from './condition'

export type PublicService = {
  id: string
  code: string
  name_en: string
  name_lv: string
  name_ru: string
  description_en: string
  description_lv: string
  description_ru: string
  best_for_en: string | null
  best_for_lv: string | null
  best_for_ru: string | null
  included_work_en: string[]
  included_work_lv: string[]
  included_work_ru: string[]
  protection_duration_en: string | null
  protection_duration_lv: string | null
  protection_duration_ru: string | null
  recommended_condition_en: string | null
  recommended_condition_lv: string | null
  recommended_condition_ru: string | null
  base_price_cents: number
  base_duration_minutes: number
  buffer_minutes: number
}

export type PublicVehicleCategory = {
  id: string
  code: string
  name_en: string
  name_lv: string
  name_ru: string
  price_multiplier: number
  duration_multiplier: number
}

export type PublicServicePackage = {
  id: string
  code: string
  name_en: string
  name_lv: string
  name_ru: string
  description_en: string
  description_lv: string
  description_ru: string
  package_price_cents: number
  base_duration_minutes: number
  buffer_minutes: number
  service_ids: string[]
}

export type PublicCaseStudy = {
  id: string
  slug: string
  title_en: string
  title_lv: string
  title_ru: string
  vehicle: string
  initial_condition_en: string
  initial_condition_lv: string
  initial_condition_ru: string
  work_performed_en: string
  work_performed_lv: string
  work_performed_ru: string
  service_duration_minutes: number | null
  price_cents: number | null
  completion_date: string | null
  media: Array<{
    id: string
    public_url: string
    media_type: 'before' | 'after'
    alt_en: string
    alt_lv: string
    alt_ru: string
    sort_order: number
  }>
}

export type PublicReview = {
  id: string
  customer_display_name: string
  rating: number
  review_text: string
  source_name: string
  source_url: string
  review_date: string
  language: 'en' | 'lv' | 'ru'
}

export type PublicBusinessConfiguration = {
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

export type PublicCatalog = {
  services: PublicService[]
  vehicleCategories: PublicVehicleCategory[]
  packages: PublicServicePackage[]
  conditionLevels: ConditionRule[]
  conditionIndicators: ConditionRule[]
  caseStudies: PublicCaseStudy[]
  reviews: PublicReview[]
  business: PublicBusinessConfiguration | null
  businessHours: Array<{ weekday: number; opens_at: string | null; closes_at: string | null; is_closed: boolean }>
  requestId: string
}
