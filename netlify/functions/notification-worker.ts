import { getNotificationConfig, getRuntimeConfig } from './_lib/env'
import { json, requestId } from './_lib/http'
import { processReservationNotifications } from './_lib/reservation-notifications'
import { createSupabaseServer } from './_lib/supabase'

export const config = { schedule: '@hourly' }

export default async function handler(): Promise<Response> {
  const id = requestId()
  try {
    const runtime = getRuntimeConfig()
    const db = createSupabaseServer(runtime.supabaseUrl, runtime.serviceRoleKey)
    const queued = await db.request<number>('/rest/v1/rpc/queue_due_reservation_notifications', {
      method: 'POST', body: '{}',
    })
    const delivery = await processReservationNotifications(db, getNotificationConfig())
    return json({ queued, ...delivery, requestId: id })
  } catch (error) {
    return json({ error: { code: error instanceof Error ? error.message : 'NOTIFICATION_WORKER_FAILED' }, requestId: id }, 503)
  }
}
