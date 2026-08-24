import { getRuntimeConfig, getTelegramSessionConfig } from './_lib/env'
import { apiError, json, readJsonBody, requestId } from './_lib/http'
import { createSupabaseServer } from './_lib/supabase'
import { bearerToken, verifyTelegramSessionToken } from './_lib/telegram-auth'
import { loadTelegramProfile, saveTelegramVehicle, setTelegramLanguage, setTelegramWriteAccess } from './_lib/telegram-repository'

function text(value: unknown, max: number): string {
  return typeof value === 'string' && value.trim().length <= max ? value.trim() : ''
}

export default async function handler(request: Request): Promise<Response> {
  const id = requestId()
  try {
    if (request.method !== 'GET' && request.method !== 'POST') return apiError(405, 'METHOD_NOT_ALLOWED', 'Use GET or POST.', id)
    const userId = await verifyTelegramSessionToken(bearerToken(request), getTelegramSessionConfig().sessionSecret)
    const runtime = getRuntimeConfig()
    const db = createSupabaseServer(runtime.supabaseUrl, runtime.serviceRoleKey)
    if (request.method === 'POST') {
      const body = await readJsonBody(request) as Record<string, unknown>
      if (body.action === 'write_access') {
        await setTelegramWriteAccess(db, userId, body.granted === true, text(body.reference, 32) || undefined)
      } else if (body.action === 'set_language' && (body.language === 'en' || body.language === 'lv' || body.language === 'ru')) {
        await setTelegramLanguage(db, userId, body.language)
      } else if (body.action === 'save_vehicle') {
        const makeModel = text(body.makeModel, 120)
        const vehicleCategoryId = text(body.vehicleCategoryId, 50)
        const registrationNumber = text(body.registrationNumber, 20)
        const vehicleId = text(body.vehicleId, 50)
        if (makeModel.length < 2 || !/^[0-9a-f-]{36}$/i.test(vehicleCategoryId)
          || (vehicleId && !/^[0-9a-f-]{36}$/i.test(vehicleId))) {
          return apiError(422, 'VALIDATION_FAILED', 'Check the vehicle fields.', id)
        }
        await saveTelegramVehicle(db, userId, {
          id: vehicleId || undefined, makeModel, vehicleCategoryId, registrationNumber: registrationNumber || undefined,
        })
      } else {
        return apiError(422, 'UNKNOWN_ACTION', 'Choose a supported action.', id)
      }
    }
    return json({ profile: await loadTelegramProfile(db, userId), requestId: id })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'TELEGRAM_PROFILE_FAILED'
    if (code.startsWith('TELEGRAM_SESSION_')) return apiError(401, 'TELEGRAM_SESSION_INVALID', 'Open the Mini App again from Telegram.', id)
    if (code === 'BODY_TOO_LARGE') return apiError(413, code, 'The request body is too large.', id)
    if (code === 'INVALID_JSON') return apiError(400, code, 'Submit valid JSON.', id)
    if (code.includes('VEHICLE') || code.includes('CUSTOMER')) return apiError(422, code, 'The vehicle could not be saved.', id)
    if (code.startsWith('CONFIG_')) return apiError(503, 'TELEGRAM_NOT_CONFIGURED', 'Telegram access is not configured.', id)
    return apiError(503, 'TELEGRAM_PROFILE_UNAVAILABLE', 'Profile data is temporarily unavailable.', id)
  }
}
