import { requireAdmin } from './_lib/auth'
import { getConfig } from './_lib/env'
import { body, enforceOrigin, error, json } from './_lib/http'
import { removeMedia } from './_lib/media'
import { database } from './_lib/supabase'
import { text, uuid } from './_lib/validation'

export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method !== 'GET' && request.method !== 'POST') return error(405, 'METHOD_NOT_ALLOWED', 'Use GET or POST.')
    const config = getConfig(); const originError = enforceOrigin(request, config.adminSiteUrl); if (originError) return originError
    const db = database(config.supabaseUrl, config.serviceRoleKey); const identity = await requireAdmin(request, config, db)
    if (identity.role !== 'admin') return error(403, 'ADMIN_FORBIDDEN', 'Administrator access required.')
    if (request.method === 'GET') {
      const customerId = uuid(new URL(request.url).searchParams.get('customerId'))
      const [customer, vehicles, reservations] = await Promise.all([
        db.request(`/rest/v1/customers?id=eq.${customerId}&select=id,full_name,phone,email,created_at,updated_at,anonymized_at`),
        db.request(`/rest/v1/vehicles?customer_id=eq.${customerId}&select=id,make_model,registration_number,applied_protection,recommended_maintenance_date,created_at`),
        db.request<Array<{ id: string }>>(`/rest/v1/reservations?customer_id=eq.${customerId}&select=id`),
      ])
      const ids = reservations.map((row) => row.id)
      const inFilter = ids.length ? `in.(${ids.join(',')})` : 'in.(00000000-0000-0000-0000-000000000000)'
      const [reservationRows, services, conditions, history, media] = await Promise.all([
        db.request(`/rest/v1/reservations?id=${inFilter}&select=id,reference,preferred_date,confirmed_date,status,starts_at,ends_at,estimated_total_min_cents,estimated_total_max_cents,final_total_cents,language,source,created_at`),
        db.request(`/rest/v1/reservation_services?reservation_id=${inFilter}&select=reservation_id,service_name_snapshot,calculated_price_cents_snapshot,duration_minutes_snapshot`),
        db.request(`/rest/v1/reservation_conditions?reservation_id=${inFilter}&select=reservation_id,condition_label_snapshot,indicator_snapshots,total_min_surcharge_cents,total_max_surcharge_cents,total_min_duration_minutes,total_max_duration_minutes,customer_notes`),
        db.request(`/rest/v1/reservation_history?reservation_id=${inFilter}&select=reservation_id,action,created_at`),
        db.request(`/rest/v1/reservation_media?reservation_id=${inFilter}&deleted_at=is.null&select=reservation_id,original_filename,mime_type,file_size,media_type,created_at`),
      ])
      return json({ exportedAt: new Date().toISOString(), customer, vehicles, reservations: reservationRows, services, conditions, history, media })
    }
    const source = await body(request); const action = text(source.action, 20)
    if (action === 'merge') {
      const target = await db.request<string>('/rest/v1/rpc/admin_merge_customers', { method: 'POST', body: JSON.stringify({ p_actor: identity.userId, p_source_customer_id: uuid(source.sourceCustomerId), p_target_customer_id: uuid(source.targetCustomerId) }) })
      return json({ customerId: target })
    }
    if (action === 'correct') {
      const recommendedDate = text(source.recommendedMaintenanceDate, 10)
      if (recommendedDate && !/^\d{4}-\d{2}-\d{2}$/.test(recommendedDate)) throw new Error('VALIDATION_FAILED')
      await db.request('/rest/v1/rpc/admin_update_customer_vehicle', {
        method: 'POST',
        body: JSON.stringify({
          p_actor: identity.userId,
          p_reservation_id: uuid(source.reservationId),
          p_customer_id: uuid(source.customerId),
          p_vehicle_id: uuid(source.vehicleId),
          p_full_name: text(source.fullName, 100),
          p_phone: text(source.phone, 32),
          p_email: text(source.email, 254),
          p_customer_notes: text(source.customerNotes, 5000) || null,
          p_registration_number: text(source.registrationNumber, 32) || null,
          p_applied_protection: text(source.appliedProtection, 500) || null,
          p_recommended_maintenance_date: recommendedDate || null,
          p_vehicle_notes: text(source.vehicleNotes, 5000) || null,
        }),
      })
      return json({ corrected: true })
    }
    if (action === 'anonymize') {
      const customerId = uuid(source.customerId); const reason = text(source.reason, 1000)
      const reservations = await db.request<Array<{ id: string }>>(`/rest/v1/reservations?customer_id=eq.${customerId}&select=id`)
      if (reservations.length) {
        const media = await db.request<Array<{ id: string; storage_path: string }>>(`/rest/v1/reservation_media?reservation_id=in.(${reservations.map((row) => row.id).join(',')})&deleted_at=is.null&select=id,storage_path`)
        for (const item of media) await removeMedia(db, item)
      }
      await db.request('/rest/v1/rpc/admin_anonymize_customer', { method: 'POST', body: JSON.stringify({ p_actor: identity.userId, p_customer_id: customerId, p_reason: reason }) })
      return json({ anonymized: true })
    }
    throw new Error('VALIDATION_FAILED')
  } catch (caught) {
    const code = caught instanceof Error ? caught.message : 'ADMIN_ERROR'
    if (code === 'ADMIN_UNAUTHENTICATED') return error(401, code, 'Sign in required.')
    if (code === 'ADMIN_FORBIDDEN') return error(403, code, 'Administrator access required.')
    if (code === 'VALIDATION_FAILED') return error(422, code, 'Check the privacy operation.')
    if (code === 'P0001') return error(409, 'ACTIVE_RESERVATIONS', 'Active reservations prevent anonymisation.')
    return error(503, 'ADMIN_UNAVAILABLE', 'Privacy operation failed.')
  }
}
