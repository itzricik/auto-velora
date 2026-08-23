import { requireAdmin } from './_lib/auth'
import { getConfig } from './_lib/env'
import { enforceOrigin, error, json } from './_lib/http'
import { database } from './_lib/supabase'
import { date } from './_lib/validation'

function rigaDate(value: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Riga', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}

export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method !== 'GET') return error(405, 'METHOD_NOT_ALLOWED', 'Use GET.')
    const config = getConfig(); const originError = enforceOrigin(request, config.adminSiteUrl); if (originError) return originError
    const db = database(config.supabaseUrl, config.serviceRoleKey); await requireAdmin(request, config, db)
    const selectedDate = date(new URL(request.url).searchParams.get('date'))
    const [reservations, segments, bays, pending, checklist, failures] = await Promise.all([
      db.request<Array<{ id: string; status: string; starts_at: string | null; estimated_total_min_cents: number | null; estimated_total_cents: number; final_total_cents: number | null }>>('/rest/v1/reservations?status=in.(pending,confirmed,in_progress,completed)&starts_at=not.is.null&select=id,status,starts_at,estimated_total_min_cents,estimated_total_cents,final_total_cents&limit=1000'),
      db.request<Array<{ reservation_id: string; work_bay_id: string; segment_start: string; occupies_capacity: boolean }>>('/rest/v1/reservation_segments?occupies_capacity=eq.true&select=reservation_id,work_bay_id,segment_start,occupies_capacity&limit=2000'),
      db.request<Array<{ id: string }>>('/rest/v1/work_bays?is_active=eq.true&select=id'),
      db.request<Array<{ id: string }>>('/rest/v1/reservations?status=eq.pending&source=eq.public_website&select=id'),
      db.request<Array<{ reservation_id: string }>>('/rest/v1/reservation_checklist_items?is_required=eq.true&is_completed=eq.false&select=reservation_id'),
      db.request<Array<{ id: string }>>('/rest/v1/notification_outbox?status=eq.failed&select=id'),
    ])
    const dayReservations = reservations.filter((row) => row.starts_at && rigaDate(row.starts_at) === selectedDate)
    const dayIds = new Set(dayReservations.map((row) => row.id))
    const occupied = new Set(segments.filter((row) => rigaDate(row.segment_start) === selectedDate).map((row) => row.work_bay_id))
    const checklistReservations = new Set(checklist.filter((row) => dayIds.has(row.reservation_id)).map((row) => row.reservation_id))
    return json({
      todayVehicles: dayReservations.length,
      occupiedBays: occupied.size,
      freeBays: Math.max(0, bays.length - occupied.size),
      pendingRequests: pending.length,
      confirmedReservations: dayReservations.filter((row) => row.status === 'confirmed').length,
      completedReservations: dayReservations.filter((row) => row.status === 'completed').length,
      estimatedDailyRevenueCents: dayReservations.reduce((total, row) => total + (row.estimated_total_min_cents ?? row.estimated_total_cents), 0),
      finalCompletedRevenueCents: dayReservations.filter((row) => row.status === 'completed').reduce((total, row) => total + (row.final_total_cents ?? 0), 0),
      checklistAlerts: checklistReservations.size,
      notificationFailures: failures.length,
    })
  } catch (caught) {
    const code = caught instanceof Error ? caught.message : 'ADMIN_ERROR'
    if (code === 'ADMIN_UNAUTHENTICATED') return error(401, code, 'Sign in required.')
    if (code === 'ADMIN_FORBIDDEN') return error(403, code, 'Active administrator access required.')
    if (code.startsWith('CONFIG_')) return error(503, 'ADMIN_NOT_CONFIGURED', 'Admin service is not configured.')
    return error(503, 'ADMIN_UNAVAILABLE', 'Dashboard could not be loaded.')
  }
}
