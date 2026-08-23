import { requireAdmin } from './_lib/auth'
import { getConfig } from './_lib/env'
import { body, enforceOrigin, error, json } from './_lib/http'
import { database } from './_lib/supabase'
import { date, integer, startTime, text, uuid } from './_lib/validation'

async function settings(db: ReturnType<typeof database>) {
  const conditionSelect = 'id,code,label_en,label_lv,label_ru,explanation_en,explanation_lv,explanation_ru,min_surcharge_cents,max_surcharge_cents,min_duration_minutes,max_duration_minutes,is_active,sort_order,requires_business_confirmation'
  const [bays, businessHours, exceptions, services, packages, schedulingRows, conditionLevels, conditionIndicators, checklistTemplates, checklistItems, checklistLinks, businessRows] = await Promise.all([
    db.request('/rest/v1/work_bays?select=id,code,name,is_active,sort_order&order=sort_order.asc,code.asc'),
    db.request('/rest/v1/business_hours?select=weekday,opens_at,closes_at,is_closed&order=weekday.asc'),
    db.request('/rest/v1/business_hour_exceptions?select=exception_date,opens_at,closes_at,is_closed,note&order=exception_date.asc&limit=365'),
    db.request('/rest/v1/services?select=id,slug,name_en,name_lv,name_ru,base_price_cents,base_duration_minutes,buffer_minutes,is_active,best_for_en,best_for_lv,best_for_ru,included_work_en,included_work_lv,included_work_ru,protection_duration_en,protection_duration_lv,protection_duration_ru,recommended_condition_en,recommended_condition_lv,recommended_condition_ru&order=sort_order.asc'),
    db.request('/rest/v1/service_packages?select=id,code,name_en,package_price_cents,base_duration_minutes,buffer_minutes,is_active&order=sort_order.asc'),
    db.request<Array<{ start_interval_minutes: number; pending_hold_minutes: number }>>('/rest/v1/scheduling_settings?singleton=eq.true&select=start_interval_minutes,pending_hold_minutes&limit=1'),
    db.request(`/rest/v1/condition_levels?select=${conditionSelect}&order=sort_order.asc`),
    db.request(`/rest/v1/condition_indicators?select=${conditionSelect}&order=sort_order.asc`),
    db.request<Array<Record<string, unknown>>>('/rest/v1/checklist_templates?select=id,code,name,description,is_default,is_active&order=is_default.desc,name.asc'),
    db.request<Array<Record<string, unknown>>>('/rest/v1/checklist_template_items?select=id,template_id,label,is_required,sort_order&order=sort_order.asc'),
    db.request<Array<{ service_id: string; template_id: string }>>('/rest/v1/service_checklist_templates?select=service_id,template_id'),
    db.request('/rest/v1/business_configuration?singleton=eq.true&select=public_business_name,legal_entity_name,registration_number,address,phone,email,instagram_url,whatsapp_url,map_url,review_url,timezone,privacy_contact,reservation_retention_days,cancellation_policy_en,cancellation_policy_lv,cancellation_policy_ru,privacy_notice_en,privacy_notice_lv,privacy_notice_ru,photo_processing_en,photo_processing_lv,photo_processing_ru,booking_terms_en,booking_terms_lv,booking_terms_ru&limit=1'),
  ])
  return {
    bays, businessHours, exceptions, services, packages,
    scheduling: schedulingRows[0] ?? { start_interval_minutes: 30, pending_hold_minutes: 30 },
    conditionLevels, conditionIndicators,
    checklistTemplates: checklistTemplates.map((template) => ({
      ...template,
      items: checklistItems.filter((item) => item.template_id === template.id),
      service_ids: checklistLinks.filter((link) => link.template_id === template.id).map((link) => link.service_id),
    })),
    business: (businessRows as Array<Record<string, unknown>>)[0],
  }
}

export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method !== 'GET' && request.method !== 'POST') return error(405, 'METHOD_NOT_ALLOWED', 'Use GET or POST.')
    const config = getConfig(); const originError = enforceOrigin(request, config.adminSiteUrl); if (originError) return originError
    const db = database(config.supabaseUrl, config.serviceRoleKey); const identity = await requireAdmin(request, config, db)
    if (request.method === 'GET') return json(await settings(db))
    const source = await body(request); const action = text(source.action, 30)
    if (action === 'update_bay') {
      await db.request(`/rest/v1/work_bays?id=eq.${uuid(source.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ is_active: source.isActive === true }) })
    } else if (action === 'update_hours') {
      const weekday = Number(source.weekday); if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error('VALIDATION_FAILED')
      const isClosed = source.isClosed === true
      const opensAt = isClosed ? null : startTime(source.opensAt); const closesAt = isClosed ? null : startTime(source.closesAt)
      if (!isClosed && (!opensAt || !closesAt || opensAt >= closesAt)) throw new Error('VALIDATION_FAILED')
      await db.request(`/rest/v1/business_hours?weekday=eq.${weekday}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ opens_at: opensAt, closes_at: closesAt, is_closed: isClosed }) })
    } else if (action === 'set_exception') {
      const exceptionDate = date(source.exceptionDate); const isClosed = source.isClosed === true
      const opensAt = isClosed ? null : startTime(source.opensAt); const closesAt = isClosed ? null : startTime(source.closesAt)
      if (!isClosed && (!opensAt || !closesAt || opensAt >= closesAt)) throw new Error('VALIDATION_FAILED')
      await db.request('/rest/v1/business_hour_exceptions?on_conflict=exception_date', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ exception_date: exceptionDate, opens_at: opensAt, closes_at: closesAt, is_closed: isClosed, note: text(source.note, 300) || null }) })
    } else if (action === 'delete_exception') {
      await db.request(`/rest/v1/business_hour_exceptions?exception_date=eq.${date(source.exceptionDate)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    } else if (action === 'update_service') {
      const basePriceCents = integer(source.basePriceCents, 0, 100_000_000)
      const baseDurationMinutes = integer(source.baseDurationMinutes, 5, 10_080)
      const bufferMinutes = integer(source.bufferMinutes, 0, 1_440)
      await db.request(`/rest/v1/services?id=eq.${uuid(source.id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ base_price_cents: basePriceCents, base_duration_minutes: baseDurationMinutes, buffer_minutes: bufferMinutes, is_active: source.isActive === true, active: source.isActive === true }),
      })
    } else if (action === 'update_package') {
      const packagePriceCents = integer(source.packagePriceCents, 0, 100_000_000)
      const baseDurationMinutes = integer(source.baseDurationMinutes, 5, 10_080)
      const bufferMinutes = integer(source.bufferMinutes, 0, 1_440)
      await db.request(`/rest/v1/service_packages?id=eq.${uuid(source.id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ package_price_cents: packagePriceCents, base_duration_minutes: baseDurationMinutes, buffer_minutes: bufferMinutes, is_active: source.isActive === true }),
      })
    } else if (action === 'update_service_content') {
      if (identity.role !== 'admin') throw new Error('ADMIN_FORBIDDEN')
      const list = (value: unknown) => Array.isArray(value) ? value.map((item) => text(item, 300)).filter(Boolean).slice(0, 20) : []
      await db.request(`/rest/v1/services?id=eq.${uuid(source.id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          best_for_en: text(source.bestForEn, 1000) || null, best_for_lv: text(source.bestForLv, 1000) || null, best_for_ru: text(source.bestForRu, 1000) || null,
          included_work_en: list(source.includedWorkEn), included_work_lv: list(source.includedWorkLv), included_work_ru: list(source.includedWorkRu),
          protection_duration_en: text(source.protectionDurationEn, 500) || null, protection_duration_lv: text(source.protectionDurationLv, 500) || null, protection_duration_ru: text(source.protectionDurationRu, 500) || null,
          recommended_condition_en: text(source.recommendedConditionEn, 500) || null, recommended_condition_lv: text(source.recommendedConditionLv, 500) || null, recommended_condition_ru: text(source.recommendedConditionRu, 500) || null,
        }),
      })
    } else if (action === 'update_scheduling') {
      const startIntervalMinutes = integer(source.startIntervalMinutes, 5, 120)
      const pendingHoldMinutes = integer(source.pendingHoldMinutes, 5, 1_440)
      await db.request('/rest/v1/scheduling_settings?singleton=eq.true', {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ start_interval_minutes: startIntervalMinutes, pending_hold_minutes: pendingHoldMinutes, updated_at: new Date().toISOString() }),
      })
    } else if (action === 'update_condition') {
      if (identity.role !== 'admin') throw new Error('ADMIN_FORBIDDEN')
      const kind = text(source.kind, 20)
      const table = kind === 'level' ? 'condition_levels' : kind === 'indicator' ? 'condition_indicators' : ''
      if (!table) throw new Error('VALIDATION_FAILED')
      const minSurcharge = integer(source.minSurchargeCents, 0, 10_000_000)
      const maxSurcharge = integer(source.maxSurchargeCents, minSurcharge, 10_000_000)
      const minDuration = integer(source.minDurationMinutes, 0, 10_080)
      const maxDuration = integer(source.maxDurationMinutes, minDuration, 10_080)
      await db.request(`/rest/v1/${table}?id=eq.${uuid(source.id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          is_active: source.isActive === true,
          explanation_en: text(source.explanationEn, 1000), explanation_lv: text(source.explanationLv, 1000), explanation_ru: text(source.explanationRu, 1000),
          min_surcharge_cents: minSurcharge, max_surcharge_cents: maxSurcharge,
          min_duration_minutes: minDuration, max_duration_minutes: maxDuration,
          requires_business_confirmation: source.requiresBusinessConfirmation === true,
        }),
      })
    } else if (action === 'update_checklist_template') {
      if (identity.role !== 'admin') throw new Error('ADMIN_FORBIDDEN')
      await db.request(`/rest/v1/checklist_templates?id=eq.${uuid(source.id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ name: text(source.name, 100), description: text(source.description, 500), is_active: source.isActive === true }),
      })
    } else if (action === 'save_checklist_template_item') {
      if (identity.role !== 'admin') throw new Error('ADMIN_FORBIDDEN')
      const itemId = source.id ? uuid(source.id) : null
      const payload = { template_id: uuid(source.templateId), label: text(source.label, 200), is_required: source.isRequired === true, sort_order: integer(source.sortOrder, 0, 10_000) }
      if (payload.label.length < 2) throw new Error('VALIDATION_FAILED')
      await db.request(itemId ? `/rest/v1/checklist_template_items?id=eq.${itemId}` : '/rest/v1/checklist_template_items', {
        method: itemId ? 'PATCH' : 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(payload),
      })
    } else if (action === 'delete_checklist_template_item') {
      if (identity.role !== 'admin') throw new Error('ADMIN_FORBIDDEN')
      await db.request(`/rest/v1/checklist_template_items?id=eq.${uuid(source.id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    } else if (action === 'toggle_service_checklist') {
      if (identity.role !== 'admin') throw new Error('ADMIN_FORBIDDEN')
      const serviceId = uuid(source.serviceId); const templateId = uuid(source.templateId)
      if (source.enabled === true) await db.request('/rest/v1/service_checklist_templates?on_conflict=service_id,template_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ service_id: serviceId, template_id: templateId }) })
      else await db.request(`/rest/v1/service_checklist_templates?service_id=eq.${serviceId}&template_id=eq.${templateId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    } else if (action === 'update_business') {
      if (identity.role !== 'admin') throw new Error('ADMIN_FORBIDDEN')
      const nullable = (value: unknown, limit: number) => text(value, limit) || null
      const retention = source.reservationRetentionDays == null || source.reservationRetentionDays === '' ? null : integer(source.reservationRetentionDays, 1, 3650)
      await db.request('/rest/v1/business_configuration?singleton=eq.true', {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          public_business_name: text(source.publicBusinessName, 200) || 'VELORA Detail Lab',
          legal_entity_name: nullable(source.legalEntityName, 200), registration_number: nullable(source.registrationNumber, 80),
          address: nullable(source.address, 500), phone: nullable(source.phone, 32), email: nullable(source.email, 254),
          instagram_url: nullable(source.instagramUrl, 500), whatsapp_url: nullable(source.whatsappUrl, 500), map_url: nullable(source.mapUrl, 500), review_url: nullable(source.reviewUrl, 500),
          privacy_contact: nullable(source.privacyContact, 254), reservation_retention_days: retention,
          cancellation_policy_en: nullable(source.cancellationPolicyEn, 5000), cancellation_policy_lv: nullable(source.cancellationPolicyLv, 5000), cancellation_policy_ru: nullable(source.cancellationPolicyRu, 5000),
          privacy_notice_en: nullable(source.privacyNoticeEn, 5000), privacy_notice_lv: nullable(source.privacyNoticeLv, 5000), privacy_notice_ru: nullable(source.privacyNoticeRu, 5000),
          photo_processing_en: nullable(source.photoProcessingEn, 5000), photo_processing_lv: nullable(source.photoProcessingLv, 5000), photo_processing_ru: nullable(source.photoProcessingRu, 5000),
          booking_terms_en: nullable(source.bookingTermsEn, 5000), booking_terms_lv: nullable(source.bookingTermsLv, 5000), booking_terms_ru: nullable(source.bookingTermsRu, 5000),
          updated_by: identity.userId,
        }),
      })
    } else throw new Error('VALIDATION_FAILED')
    return json(await settings(db))
  } catch (caught) {
    const code = caught instanceof Error ? caught.message : 'ADMIN_ERROR'
    if (code === 'ADMIN_UNAUTHENTICATED') return error(401, code, 'Sign in required.')
    if (code === 'ADMIN_FORBIDDEN') return error(403, code, 'Active administrator access required.')
    if (code === 'VALIDATION_FAILED') return error(422, code, 'Check the submitted settings.')
    if (code.startsWith('CONFIG_')) return error(503, 'ADMIN_NOT_CONFIGURED', 'Admin service is not configured.')
    return error(503, 'ADMIN_UNAVAILABLE', 'Settings could not be saved.')
  }
}
