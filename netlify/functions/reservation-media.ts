import { isUuid } from '../../src/shared/contracts'
import { getRuntimeConfig } from './_lib/env'
import { apiError, enforceOrigin, json, readJsonBody, requestId } from './_lib/http'
import { finalizeCustomerMedia } from './_lib/media'
import { createSupabaseServer } from './_lib/supabase'

export default async function handler(request: Request): Promise<Response> {
  const id = requestId()
  try {
    if (request.method !== 'POST') return apiError(405, 'METHOD_NOT_ALLOWED', 'Use POST.', id)
    const config = getRuntimeConfig()
    const originError = enforceOrigin(request, config.publicSiteUrl)
    if (originError) return originError
    const source = await readJsonBody(request) as Record<string, unknown>
    const mediaId = typeof source.mediaId === 'string' ? source.mediaId : ''
    const token = typeof source.finalizeToken === 'string' ? source.finalizeToken : ''
    if (source.action !== 'finalize' || !isUuid(mediaId) || !/^[0-9a-f]{64}$/.test(token)) {
      return apiError(422, 'MEDIA_VALIDATION_FAILED', 'The media request is invalid.', id)
    }
    await finalizeCustomerMedia({
      db: createSupabaseServer(config.supabaseUrl, config.serviceRoleKey),
      rateLimitSecret: config.rateLimitSecret,
      mediaId,
      token,
    })
    return json({ ready: true, requestId: id })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'MEDIA_ERROR'
    if (code === 'MEDIA_TOKEN_INVALID') return apiError(403, code, 'The upload authorization is invalid.', id)
    if (code === 'MEDIA_NOT_FOUND') return apiError(404, code, 'The image record was not found.', id)
    if (code.startsWith('CONFIG_')) return apiError(503, 'MEDIA_NOT_CONFIGURED', 'Image upload is unavailable.', id)
    return apiError(503, 'MEDIA_FINALIZE_FAILED', 'The image could not be finalized.', id)
  }
}
