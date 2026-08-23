import { requireAdmin } from './_lib/auth'
import { getConfig } from './_lib/env'
import { enforceOrigin, error, json } from './_lib/http'
import { historySearch } from './_lib/repository'
import { database } from './_lib/supabase'

export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method !== 'GET') return error(405, 'METHOD_NOT_ALLOWED', 'Use GET.')
    const config = getConfig(); const originError = enforceOrigin(request, config.adminSiteUrl); if (originError) return originError
    const db = database(config.supabaseUrl, config.serviceRoleKey); await requireAdmin(request, config, db)
    const search = (new URL(request.url).searchParams.get('search') ?? '').slice(0, 120)
    return json({ reservations: await historySearch(db, search) })
  } catch (caught) {
    const code = caught instanceof Error ? caught.message : 'ADMIN_ERROR'
    if (code === 'ADMIN_UNAUTHENTICATED') return error(401, code, 'Sign in required.')
    if (code === 'ADMIN_FORBIDDEN') return error(403, code, 'Active administrator access required.')
    return error(503, 'ADMIN_UNAVAILABLE', 'History could not be loaded.')
  }
}
