import { requireAdmin } from './_lib/auth'
import { getConfig } from './_lib/env'
import { enforceOrigin, error, json } from './_lib/http'
import { newRequests } from './_lib/repository'
import { database } from './_lib/supabase'
import { text } from './_lib/validation'

export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method !== 'GET') return error(405, 'METHOD_NOT_ALLOWED', 'Use GET.')
    const config = getConfig()
    const originError = enforceOrigin(request, config.adminSiteUrl)
    if (originError) return originError
    const db = database(config.supabaseUrl, config.serviceRoleKey)
    const identity = await requireAdmin(request, config, db)
    const search = text(new URL(request.url).searchParams.get('search'), 120)
    return json({ identity, requests: await newRequests(db, search) })
  } catch (caught) {
    const code = caught instanceof Error ? caught.message : 'ADMIN_ERROR'
    if (code === 'ADMIN_UNAUTHENTICATED') return error(401, code, 'Sign in required.')
    if (code === 'ADMIN_FORBIDDEN') return error(403, code, 'Active administrator access required.')
    if (code === 'VALIDATION_FAILED') return error(422, code, 'Search is invalid.')
    if (code.startsWith('CONFIG_')) return error(503, 'ADMIN_NOT_CONFIGURED', 'Admin service is not configured.')
    return error(503, 'ADMIN_UNAVAILABLE', 'Requests could not be loaded.')
  }
}
