import { requireAdmin } from './_lib/auth'
import { getConfig } from './_lib/env'
import { body, enforceOrigin, error, json } from './_lib/http'
import { database } from './_lib/supabase'
import { date, integer, startTime, text, uuid } from './_lib/validation'

async function settings(db: ReturnType<typeof database>) {
  const [bays, businessHours, exceptions, services, packages, schedulingRows] = await Promise.all([
    db.request('/rest/v1/work_bays?select=id,code,name,is_active,sort_order&order=sort_order.asc,code.asc'),
    db.request('/rest/v1/business_hours?select=weekday,opens_at,closes_at,is_closed&order=weekday.asc'),
    db.request('/rest/v1/business_hour_exceptions?select=exception_date,opens_at,closes_at,is_closed,note&order=exception_date.asc&limit=365'),
    db.request('/rest/v1/services?select=id,slug,name_en,name_lv,name_ru,base_price_cents,base_duration_minutes,buffer_minutes,is_active&order=sort_order.asc'),
    db.request('/rest/v1/service_packages?select=id,code,name_en,base_duration_minutes,buffer_minutes,is_active&order=sort_order.asc'),
    db.request<Array<{ start_interval_minutes: number; pending_hold_minutes: number }>>('/rest/v1/scheduling_settings?singleton=eq.true&select=start_interval_minutes,pending_hold_minutes&limit=1'),
  ])
  return {
    bays, businessHours, exceptions, services, packages,
    scheduling: schedulingRows[0] ?? { start_interval_minutes: 30, pending_hold_minutes: 30 },
  }
}

export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method !== 'GET' && request.method !== 'POST') return error(405, 'METHOD_NOT_ALLOWED', 'Use GET or POST.')
    const config = getConfig(); const originError = enforceOrigin(request, config.adminSiteUrl); if (originError) return originError
    const db = database(config.supabaseUrl, config.serviceRoleKey); await requireAdmin(request, config, db)
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
      const baseDurationMinutes = integer(source.baseDurationMinutes, 5, 10_080)
      const bufferMinutes = integer(source.bufferMinutes, 0, 1_440)
      await db.request(`/rest/v1/services?id=eq.${uuid(source.id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ base_duration_minutes: baseDurationMinutes, buffer_minutes: bufferMinutes, is_active: source.isActive === true, active: source.isActive === true }),
      })
    } else if (action === 'update_package') {
      const baseDurationMinutes = integer(source.baseDurationMinutes, 5, 10_080)
      const bufferMinutes = integer(source.bufferMinutes, 0, 1_440)
      await db.request(`/rest/v1/service_packages?id=eq.${uuid(source.id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ base_duration_minutes: baseDurationMinutes, buffer_minutes: bufferMinutes, is_active: source.isActive === true }),
      })
    } else if (action === 'update_scheduling') {
      const startIntervalMinutes = integer(source.startIntervalMinutes, 5, 120)
      const pendingHoldMinutes = integer(source.pendingHoldMinutes, 5, 1_440)
      await db.request('/rest/v1/scheduling_settings?singleton=eq.true', {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ start_interval_minutes: startIntervalMinutes, pending_hold_minutes: pendingHoldMinutes, updated_at: new Date().toISOString() }),
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
