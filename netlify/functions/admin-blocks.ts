import { isUuid } from '../../src/shared/contracts'
import { requireAdmin } from './_lib/admin-auth'
import {
  createBlockedPeriod,
  deleteBlockedPeriod,
  listBlockedPeriods,
  listWorkBaysAndHours,
} from './_lib/admin-repository'
import { getRuntimeConfig } from './_lib/env'
import { apiError, enforceOrigin, json, readJsonBody, requestId } from './_lib/http'
import { logServerResult } from './_lib/logger'
import { createSupabaseServer } from './_lib/supabase'

export default async function handler(request: Request): Promise<Response> {
  const started = Date.now()
  const id = requestId()
  let resultStatus = 'error'
  let errorCode: string | undefined

  try {
    const config = getRuntimeConfig()
    const originError = enforceOrigin(request, config.publicSiteUrl)
    if (originError) return originError
    const db = createSupabaseServer(config.supabaseUrl, config.serviceRoleKey)
    const identity = await requireAdmin(request, {
      supabaseUrl: config.supabaseUrl,
      anonKey: config.supabaseAnonKey,
      db,
    })

    if (request.method === 'GET') {
      const [blocks, availability] = await Promise.all([
        listBlockedPeriods(db),
        listWorkBaysAndHours(db),
      ])
      resultStatus = 'success'
      return json({ blocks, ...availability, requestId: id })
    }

    if (request.method === 'POST') {
      const body = await readJsonBody(request) as Record<string, unknown>
      const startsAt = typeof body.startsAt === 'string' ? body.startsAt : ''
      const endsAt = typeof body.endsAt === 'string' ? body.endsAt : ''
      const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
      const workBayId = typeof body.workBayId === 'string' && body.workBayId ? body.workBayId : null
      if (Number.isNaN(Date.parse(startsAt)) || Number.isNaN(Date.parse(endsAt))
        || Date.parse(endsAt) <= Date.parse(startsAt)
        || reason.length < 1 || reason.length > 500
        || (workBayId && !isUuid(workBayId))) {
        return apiError(422, 'INVALID_BLOCK', 'Check the blocked period fields.', id)
      }
      const block = await createBlockedPeriod(db, {
        work_bay_id: workBayId,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
        reason,
        createdBy: identity.userId,
      })
      resultStatus = 'success'
      return json({ block, requestId: id }, 201)
    }

    if (request.method === 'DELETE') {
      const blockId = new URL(request.url).searchParams.get('id') ?? ''
      if (!isUuid(blockId)) return apiError(422, 'INVALID_BLOCK_ID', 'Invalid blocked period.', id)
      await deleteBlockedPeriod(db, blockId)
      resultStatus = 'success'
      return json({ deleted: true, requestId: id })
    }

    return apiError(405, 'METHOD_NOT_ALLOWED', 'Use GET, POST or DELETE.', id)
  } catch (error) {
    errorCode = error instanceof Error ? error.message : 'UNEXPECTED_ERROR'
    if (errorCode === 'ADMIN_UNAUTHENTICATED') return apiError(401, errorCode, 'Sign in is required.', id)
    if (errorCode === 'ADMIN_FORBIDDEN') return apiError(403, errorCode, 'Active staff access is required.', id)
    return apiError(errorCode.startsWith('CONFIG_') ? 503 : 500, 'ADMIN_BLOCKS_FAILED', 'Availability management failed.', id)
  } finally {
    logServerResult({
      requestId: id,
      functionName: 'admin-blocks',
      resultStatus,
      durationMs: Date.now() - started,
      errorCode,
    })
  }
}
