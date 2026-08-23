import { isUuid, type BookingLanguage } from '../../src/shared/contracts'
import { getRuntimeConfig } from './_lib/env'
import { apiError, enforceOrigin, json, requestId } from './_lib/http'
import { logServerResult } from './_lib/logger'
import { getAvailableSlots } from './_lib/scheduling'
import { createSupabaseServer } from './_lib/supabase'

function supportedLanguage(value: string): value is BookingLanguage {
  return value === 'en' || value === 'lv' || value === 'ru'
}

function validLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
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
    const conditionLevelId = url.searchParams.get('conditionLevelId') ?? ''
    const conditionIndicatorIds = (url.searchParams.get('conditionIndicatorIds') ?? '').split(',').filter(Boolean)

    if ((localDate && !validLocalDate(localDate))
      || !isUuid(vehicleCategoryId)
      || (!serviceIds.length && !packageId)
      || (serviceIds.length > 0 && Boolean(packageId))
      || serviceIds.length > 12
      || serviceIds.some((value) => !isUuid(value))
      || (packageId && !isUuid(packageId))
      || !supportedLanguage(languageValue)) {
      errorCode = 'INVALID_QUERY'
      return apiError(422, errorCode, 'The availability query is invalid.', id)
    }
    if (!isUuid(conditionLevelId)
      || conditionIndicatorIds.length > 8
      || conditionIndicatorIds.some((value) => !isUuid(value))) {
      errorCode = 'INVALID_CONDITION_QUERY'
      return apiError(422, errorCode, 'The condition selection is invalid.', id)
    }

    const db = createSupabaseServer(config.supabaseUrl, config.serviceRoleKey)
    const result = await getAvailableSlots(db, {
      localDate: localDate || undefined,
      vehicleCategoryId,
      serviceIds,
      packageId,
      timezone,
      language: languageValue,
      conditionLevelId,
      conditionIndicatorIds,
    }, config)
    resultStatus = 'success'
    return json({
      slots: result.slots,
      nearest: result.nearest,
      serverEstimate: {
        priceCents: result.estimate.priceMinCents,
        durationMinutes: result.estimate.durationMaxMinutes,
        priceMinCents: result.estimate.priceMinCents,
        priceMaxCents: result.estimate.priceMaxCents,
        durationMinMinutes: result.estimate.durationMinMinutes,
        durationMaxMinutes: result.estimate.durationMaxMinutes,
      },
      requestId: id,
    })
  } catch (error) {
    errorCode = error instanceof Error ? error.message : 'UNEXPECTED_ERROR'
    if (errorCode.startsWith('CONFIG_')) return apiError(503, 'AVAILABILITY_NOT_CONFIGURED', 'Availability is temporarily unavailable.', id)
    if (errorCode === 'UNSUPPORTED_TIMEZONE') return apiError(422, errorCode, 'Select the supported studio timezone.', id)
    if (errorCode.startsWith('UNKNOWN_') || errorCode === 'EMPTY_PACKAGE' || errorCode === 'INACTIVE_PACKAGE_SERVICE') {
      return apiError(422, 'INVALID_CATALOG_SELECTION', 'A selected service is unavailable.', id)
    }
    return apiError(503, 'AVAILABILITY_UNAVAILABLE', 'Availability could not be loaded.', id)
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
