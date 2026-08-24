import { getRuntimeConfig, getTelegramAuthConfig } from './_lib/env'
import { apiError, json, readJsonBody, requestId } from './_lib/http'
import { createSupabaseServer } from './_lib/supabase'
import { createTelegramSessionToken, validateTelegramInitData } from './_lib/telegram-auth'
import { loadTelegramProfile, upsertTelegramProfile } from './_lib/telegram-repository'

export default async function handler(request: Request): Promise<Response> {
  const id = requestId()
  try {
    if (request.method !== 'POST') return apiError(405, 'METHOD_NOT_ALLOWED', 'Use POST.', id)
    const body = await readJsonBody(request) as Record<string, unknown>
    const initData = typeof body.initData === 'string' ? body.initData : ''
    const auth = getTelegramAuthConfig()
    const identity = await validateTelegramInitData(initData, auth.botToken, auth.authMaxAgeSeconds)
    const runtime = getRuntimeConfig()
    const db = createSupabaseServer(runtime.supabaseUrl, runtime.serviceRoleKey)
    await upsertTelegramProfile(db, identity)
    const [session, profile] = await Promise.all([
      createTelegramSessionToken(identity.userId, auth.sessionSecret, auth.sessionTtlSeconds),
      loadTelegramProfile(db, identity.userId),
    ])
    return json({ ...session, profile, startParam: identity.startParam, requestId: id })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'TELEGRAM_AUTH_FAILED'
    if (code === 'BODY_TOO_LARGE') return apiError(413, code, 'The request body is too large.', id)
    if (code === 'INVALID_JSON') return apiError(400, code, 'Submit valid JSON.', id)
    if (code === 'TELEGRAM_AUTH_EXPIRED') return apiError(401, code, 'Open the Mini App again from Telegram.', id)
    if (code.startsWith('TELEGRAM_AUTH_')) return apiError(401, 'TELEGRAM_AUTH_INVALID', 'Telegram authentication failed.', id)
    if (code.startsWith('CONFIG_')) return apiError(503, 'TELEGRAM_NOT_CONFIGURED', 'Telegram access is not configured.', id)
    return apiError(503, 'TELEGRAM_AUTH_UNAVAILABLE', 'Telegram authentication is temporarily unavailable.', id)
  }
}
