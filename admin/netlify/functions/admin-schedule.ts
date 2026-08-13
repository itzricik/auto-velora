import { requireAdmin } from './_lib/auth'
import { getConfig } from './_lib/env'
import { enforceOrigin, error, json } from './_lib/http'
import { catalog, schedule } from './_lib/repository'
import { database } from './_lib/supabase'
import { date } from './_lib/validation'

export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method !== 'GET') return error(405, 'METHOD_NOT_ALLOWED', 'Use GET.')
    const config = getConfig()
    const originError = enforceOrigin(request, config.adminSiteUrl)
    if (originError) return originError
    const db = database(config.supabaseUrl, config.serviceRoleKey)
    const identity = await requireAdmin(request, config, db)
    const slotDate = date(new URL(request.url).searchParams.get('date'))
    const [slots, catalogData] = await Promise.all([schedule(db, slotDate), catalog(db)])
    return json({ identity, slots, ...catalogData })
  } catch (caught) {
    const code = caught instanceof Error ? caught.message : 'ADMIN_ERROR'
    if (code === 'ADMIN_UNAUTHENTICATED') return error(401, code, 'Sign in required.')
    if (code === 'ADMIN_FORBIDDEN') return error(403, code, 'Active administrator access required.')
    if (code === 'VALIDATION_FAILED') return error(422, code, 'Select a valid date.')
    if (code.startsWith('CONFIG_')) return error(503, 'ADMIN_NOT_CONFIGURED', 'Admin service is not configured.')
    return error(503, 'ADMIN_UNAVAILABLE', 'Schedule could not be loaded.')
  }
}
