import { isUuid, type BookingLanguage } from '../../src/shared/contracts'
import { getRuntimeConfig } from './_lib/env'
import { apiError, enforceOrigin, json, requestId } from './_lib/http'
import { logServerResult } from './_lib/logger'
import { getAvailableSlots } from './_lib/scheduling'
import { createSupabaseServer } from './_lib/supabase'

function supportedLanguage(value: string): value is BookingLanguage {
  return value === 'en' || value === 'lv' || value === 'ru'
}

export default async function handler(request: Request): Promise<Response> {
  const started = Date.now()
  const id = requestId()
  let resultStatus = 'error'
  let errorCode: string | undefined

  try {
    if (request.method !== 'GET') return apiError(405, 'METHOD_NOT_ALLOWED', 'Use GET.', id)
    const config = getRuntimeConfig()
    const originError = enforceOrigin(request, config.publicSiteUrl)
    if (originError) return originError
    const url = new URL(request.url)
    const localDate = url.searchParams.get('date') ?? ''
    const vehicleCategoryId = url.searchParams.get('vehicleCategoryId') ?? ''
    const serviceIds = (url.searchParams.get('serviceIds') ?? '').split(',').filter(Boolean)
    const packageId = url.searchParams.get('packageId') || undefined
    const timezone = url.searchParams.get('timezone') ?? config.studioTimezone
    const languageValue = url.searchParams.get('language') ?? 'en'

    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)
      || !isUuid(vehicleCategoryId)
      || (!serviceIds.length && !packageId)
      || serviceIds.some((value) => !isUuid(value))
      || (packageId && !isUuid(packageId))
      || !supportedLanguage(languageValue)) {
      errorCode = 'INVALID_QUERY'
      return apiError(422, errorCode, 'The availability query is invalid.', id)
    }

    const db = createSupabaseServer(config.supabaseUrl, config.serviceRoleKey)
    const result = await getAvailableSlots(db, {
      localDate,
      vehicleCategoryId,
      serviceIds,
      packageId,
      timezone,
      language: languageValue,
    }, config)
    resultStatus = 'success'
    return json({
      slots: result.slots,
      serverEstimate: {
        priceCents: result.estimate.priceCents,
        durationMinutes: result.estimate.durationMinutes,
      },
      requestId: id,
    })
  } catch (error) {
    errorCode = error instanceof Error ? error.message : 'UNEXPECTED_ERROR'
    const status = errorCode.startsWith('CONFIG_') ? 503 : errorCode === 'UNSUPPORTED_TIMEZONE' ? 422 : 500
    return apiError(status, errorCode, status === 500 ? 'Availability could not be loaded.' : 'Availability is not configured.', id)
  } finally {
    logServerResult({
      requestId: id,
      functionName: 'availability',
      resultStatus,
      durationMs: Date.now() - started,
      errorCode,
    })
  }
}
