import type { ConditionRule } from '../../src/shared/condition'
import type { PublicBusinessConfiguration, PublicCaseStudy, PublicReview, PublicService, PublicServicePackage, PublicVehicleCategory } from '../../src/shared/publicCatalog'
import { getRuntimeConfig } from './_lib/env'
import { apiError, enforceOrigin, json, requestId } from './_lib/http'
import { createSupabaseServer } from './_lib/supabase'

type CaseStudyRow = Omit<PublicCaseStudy, 'media'>
type CaseMedia = PublicCaseStudy['media'][number] & { case_study_id: string }
type PackageServiceRow = { package_id: string; service_id: string }

export default async function handler(request: Request): Promise<Response> {
  const id = requestId()
  try {
    if (request.method !== 'GET') return apiError(405, 'METHOD_NOT_ALLOWED', 'Use GET.', id)
    const config = getRuntimeConfig()
    const originError = enforceOrigin(request, config.publicSiteUrl)
    if (originError) return originError
    const db = createSupabaseServer(config.supabaseUrl, config.serviceRoleKey)
    const conditionSelect = 'id,code,label_en,label_lv,label_ru,explanation_en,explanation_lv,explanation_ru,min_surcharge_cents,max_surcharge_cents,min_duration_minutes,max_duration_minutes,is_active,sort_order,requires_business_confirmation'
    const [services, vehicleCategories, packages, packageServices, conditionLevels, conditionIndicators, caseStudies, media, reviews, businessRows, businessHours] = await Promise.all([
      db.request<PublicService[]>('/rest/v1/services?active=eq.true&is_active=eq.true&select=id,code,name_en,name_lv,name_ru,description_en,description_lv,description_ru,best_for_en,best_for_lv,best_for_ru,included_work_en,included_work_lv,included_work_ru,protection_duration_en,protection_duration_lv,protection_duration_ru,recommended_condition_en,recommended_condition_lv,recommended_condition_ru,base_price_cents,base_duration_minutes,buffer_minutes&order=sort_order.asc'),
      db.request<PublicVehicleCategory[]>('/rest/v1/vehicle_categories?is_active=eq.true&select=id,code,name_en,name_lv,name_ru,price_multiplier,duration_multiplier&order=sort_order.asc'),
      db.request<Omit<PublicServicePackage, 'service_ids'>[]>('/rest/v1/service_packages?is_active=eq.true&select=id,code,name_en,name_lv,name_ru,description_en,description_lv,description_ru,package_price_cents,base_duration_minutes,buffer_minutes&order=sort_order.asc'),
      db.request<PackageServiceRow[]>('/rest/v1/package_services?select=package_id,service_id&order=sort_order.asc'),
      db.request<ConditionRule[]>(`/rest/v1/condition_levels?is_active=eq.true&select=${conditionSelect}&order=sort_order.asc`),
      db.request<ConditionRule[]>(`/rest/v1/condition_indicators?is_active=eq.true&select=${conditionSelect}&order=sort_order.asc`),
      db.request<CaseStudyRow[]>('/rest/v1/case_studies?is_published=eq.true&select=id,slug,title_en,title_lv,title_ru,vehicle,initial_condition_en,initial_condition_lv,initial_condition_ru,work_performed_en,work_performed_lv,work_performed_ru,service_duration_minutes,price_cents,completion_date&order=sort_order.asc,completion_date.desc'),
      db.request<CaseMedia[]>('/rest/v1/case_study_media?select=id,case_study_id,public_url,media_type,alt_en,alt_lv,alt_ru,sort_order&order=sort_order.asc'),
      db.request<PublicReview[]>('/rest/v1/reviews?is_published=eq.true&select=id,customer_display_name,rating,review_text,source_name,source_url,review_date,language&order=review_date.desc'),
      db.request<PublicBusinessConfiguration[]>('/rest/v1/business_configuration?singleton=eq.true&select=public_business_name,legal_entity_name,registration_number,address,phone,email,instagram_url,whatsapp_url,map_url,review_url,timezone,privacy_contact,reservation_retention_days,cancellation_policy_en,cancellation_policy_lv,cancellation_policy_ru,privacy_notice_en,privacy_notice_lv,privacy_notice_ru,photo_processing_en,photo_processing_lv,photo_processing_ru,booking_terms_en,booking_terms_lv,booking_terms_ru&limit=1'),
      db.request<Array<{ weekday: number; opens_at: string | null; closes_at: string | null; is_closed: boolean }>>('/rest/v1/business_hours?select=weekday,opens_at,closes_at,is_closed&order=weekday.asc'),
    ])
    return json({
      services,
      vehicleCategories,
      packages: packages.map((item) => ({
        ...item,
        service_ids: packageServices.filter((row) => row.package_id === item.id).map((row) => row.service_id),
      })),
      conditionLevels,
      conditionIndicators,
      caseStudies: caseStudies.map((study) => ({
        ...study,
        media: media.filter((item) => item.case_study_id === study.id).map((item) => ({
          id: item.id,
          public_url: item.public_url,
          media_type: item.media_type,
          alt_en: item.alt_en,
          alt_lv: item.alt_lv,
          alt_ru: item.alt_ru,
          sort_order: item.sort_order,
        })),
      })),
      reviews,
      business: businessRows[0] ?? null,
      businessHours,
      requestId: id,
    }, 200, { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('CONFIG_')) {
      return apiError(503, 'CATALOG_NOT_CONFIGURED', 'Catalog is temporarily unavailable.', id)
    }
    return apiError(503, 'CATALOG_UNAVAILABLE', 'Catalog is temporarily unavailable.', id)
  }
}
