import { requireAdmin } from './_lib/auth'
import { getConfig } from './_lib/env'
import { body, enforceOrigin, error, json } from './_lib/http'
import { database } from './_lib/supabase'
import { date, integer, text, uuid } from './_lib/validation'

async function content(db: ReturnType<typeof database>) {
  const [caseStudies, caseMedia, reviews] = await Promise.all([
    db.request('/rest/v1/case_studies?select=*&order=sort_order.asc,created_at.desc'),
    db.request('/rest/v1/case_study_media?select=*&order=sort_order.asc'),
    db.request('/rest/v1/reviews?select=*&order=review_date.desc'),
  ])
  return { caseStudies, caseMedia, reviews }
}

function url(value: unknown) {
  const result = text(value, 1000)
  if (!/^https:\/\//.test(result)) throw new Error('VALIDATION_FAILED')
  return result
}

export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method !== 'GET' && request.method !== 'POST') return error(405, 'METHOD_NOT_ALLOWED', 'Use GET or POST.')
    const config = getConfig(); const originError = enforceOrigin(request, config.adminSiteUrl); if (originError) return originError
    const db = database(config.supabaseUrl, config.serviceRoleKey); const identity = await requireAdmin(request, config, db)
    if (request.method === 'GET') return json(await content(db))
    if (identity.role !== 'admin') return error(403, 'ADMIN_FORBIDDEN', 'Administrator access required.')
    const source = await body(request); const action = text(source.action, 30)
    if (action === 'save_review') {
      const id = source.id ? uuid(source.id) : crypto.randomUUID()
      const rating = integer(source.rating, 1, 5); const language = text(source.language, 2)
      if (!['en', 'lv', 'ru'].includes(language)) throw new Error('VALIDATION_FAILED')
      await db.request('/rest/v1/reviews?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id, customer_display_name: text(source.customerDisplayName, 100), rating, review_text: text(source.reviewText, 2000), source_name: text(source.sourceName, 80), source_url: url(source.sourceUrl), review_date: date(source.reviewDate), language, is_published: source.isPublished === true }) })
    } else if (action === 'delete_review') {
      await db.request(`/rest/v1/reviews?id=eq.${uuid(source.id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    } else if (action === 'save_case') {
      const id = source.id ? uuid(source.id) : crypto.randomUUID(); const slug = text(source.slug, 120)
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('VALIDATION_FAILED')
      await db.request('/rest/v1/case_studies?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id, slug, title_en: text(source.titleEn, 200), title_lv: text(source.titleLv, 200), title_ru: text(source.titleRu, 200), vehicle: text(source.vehicle, 120), initial_condition_en: text(source.initialConditionEn, 2000), initial_condition_lv: text(source.initialConditionLv, 2000), initial_condition_ru: text(source.initialConditionRu, 2000), work_performed_en: text(source.workPerformedEn, 3000), work_performed_lv: text(source.workPerformedLv, 3000), work_performed_ru: text(source.workPerformedRu, 3000), service_duration_minutes: source.serviceDurationMinutes ? integer(source.serviceDurationMinutes, 1, 10080) : null, price_cents: source.priceCents == null ? null : integer(source.priceCents, 0, 100_000_000), completion_date: source.completionDate ? date(source.completionDate) : null, is_published: source.isPublished === true, sort_order: integer(source.sortOrder ?? 0, 0, 10000) }) })
    } else if (action === 'delete_case') {
      await db.request(`/rest/v1/case_studies?id=eq.${uuid(source.id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    } else if (action === 'add_case_media') {
      const caseStudyId = uuid(source.caseStudyId); const mediaType = text(source.mediaType, 10)
      if (!['before', 'after'].includes(mediaType)) throw new Error('VALIDATION_FAILED')
      await db.request('/rest/v1/case_study_media', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ case_study_id: caseStudyId, public_url: url(source.publicUrl), media_type: mediaType, alt_en: text(source.altEn, 300), alt_lv: text(source.altLv, 300), alt_ru: text(source.altRu, 300), sort_order: integer(source.sortOrder ?? 0, 0, 10000) }) })
    } else if (action === 'delete_case_media') {
      await db.request(`/rest/v1/case_study_media?id=eq.${uuid(source.id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    } else throw new Error('VALIDATION_FAILED')
    return json(await content(db))
  } catch (caught) {
    const code = caught instanceof Error ? caught.message : 'ADMIN_ERROR'
    if (code === 'ADMIN_UNAUTHENTICATED') return error(401, code, 'Sign in required.')
    if (code === 'ADMIN_FORBIDDEN') return error(403, code, 'Administrator access required.')
    if (code === 'VALIDATION_FAILED') return error(422, code, 'Check the content fields.')
    return error(503, 'ADMIN_UNAVAILABLE', 'Content could not be saved.')
  }
}
