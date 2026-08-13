import { requireAdmin } from './_lib/auth'
import { getConfig } from './_lib/env'
import { body, enforceOrigin, error, json } from './_lib/http'
import { block, reservation, save, unblock } from './_lib/repository'
import { database, SupabaseError } from './_lib/supabase'
import { text, uuid } from './_lib/validation'

export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method !== 'GET' && request.method !== 'POST') return error(405, 'METHOD_NOT_ALLOWED', 'Use GET or POST.')
    const config = getConfig()
    const originError = enforceOrigin(request, config.adminSiteUrl)
    if (originError) return originError
    const db = database(config.supabaseUrl, config.serviceRoleKey)
    const identity = await requireAdmin(request, config, db)

    if (request.method === 'GET') {
      const id = uuid(new URL(request.url).searchParams.get('id'))
      const result = await reservation(db, id)
      return result ? json({ reservation: result }) : error(404, 'NOT_FOUND', 'Reservation not found.')
    }

    const source = await body(request)
    const action = text(source.action, 20)
    if (action === 'save') return json(await save(db, identity.userId, source), 201)
    if (action === 'block') return json({ blocked: await block(db, identity.userId, source) }, 201)
    if (action === 'unblock') return json({ unblocked: await unblock(db, identity.userId, source) })
    return error(422, 'VALIDATION_FAILED', 'Unknown action.')
  } catch (caught) {
    const code = caught instanceof Error ? caught.message : 'ADMIN_ERROR'
    if (code === 'ADMIN_UNAUTHENTICATED') return error(401, code, 'Sign in required.')
    if (code === 'ADMIN_FORBIDDEN') return error(403, code, 'Active administrator access required.')
    if (code === 'NOT_FOUND') return error(404, code, 'Reservation not found.')
    if (code === 'SLOT_CONFLICT' || (caught instanceof SupabaseError && caught.code === '23505')) return error(409, 'SLOT_CONFLICT', 'One or more intervals are unavailable.')
    if (code === 'VALIDATION_FAILED' || code === 'INVALID_CATALOG_SELECTION') return error(422, code, 'Check the submitted fields.')
    if (code === 'BODY_TOO_LARGE') return error(413, code, 'Request is too large.')
    if (code === 'INVALID_JSON') return error(400, code, 'Submit valid JSON.')
    if (code.startsWith('CONFIG_')) return error(503, 'ADMIN_NOT_CONFIGURED', 'Admin service is not configured.')
    return error(503, 'ADMIN_UNAVAILABLE', 'Reservation could not be updated.')
  }
}
