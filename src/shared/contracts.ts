export const BOOKING_STATUSES = [
  'new',
  'contacted',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
] as const

export type BookingStatus = (typeof BOOKING_STATUSES)[number]
export type BookingLanguage = 'en' | 'lv' | 'ru'
export const CURRENT_CONSENT_POLICY_VERSION = '2026-08-supabase-v1'

export type PublicBookingRequest = {
  name: string
  email: string
  phone: string
  vehicleCategoryId: string
  vehicleDescription: string
  serviceIds: string[]
  packageId?: string
  requestedStart: string
  language: BookingLanguage
  customerNotes?: string
  consentAccepted: boolean
  consentPolicyVersion: string
  idempotencyKey: string
  company?: string
  turnstileToken?: string
}

export type PublicMediaDescriptor = {
  clientId: string
  filename: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  size: number
}

export type ConditionSelection = {
  levelId: string
  indicatorIds: string[]
  notes?: string
}

export type PublicBookingResult = {
  reference: string
  status: Extract<BookingStatus, 'new' | 'confirmed'>
  start: string
  end: string
  serverPriceCents: number
  serverDurationMinutes: number
  message: string
  requestId: string
}

export type PublicReservationRequest = {
  name: string
  email: string
  phone: string
  vehicleCategoryId: string
  vehicleDescription: string
  serviceIds: string[]
  packageId?: string
  requestedStart: string
  language: BookingLanguage
  customerNotes?: string
  consentAccepted: boolean
  consentPolicyVersion: string
  idempotencyKey: string
  company?: string
  turnstileToken?: string
  overnightAcknowledged: boolean
  condition: ConditionSelection
  media?: PublicMediaDescriptor[]
}

export type PublicReservationResult = {
  reference: string
  status: 'pending'
  start: string
  end: string
  serverPriceCents: number
  serverDurationMinutes: number
  estimatedPriceMinCents: number
  estimatedPriceMaxCents: number
  estimatedDurationMinMinutes: number
  estimatedDurationMaxMinutes: number
  mediaUploads: Array<{
    mediaId: string
    clientId: string
    uploadUrl: string
    uploadToken: string
    storagePath: string
    finalizeToken: string
  }>
  mediaUploadError?: string
  message: string
  requestId: string
}

export type AvailabilitySlot = {
  start: string
  end: string
  displayTime: string
  estimatedDurationMinutes: number
  availableBayCount: number
  segments: Array<{ start: string; end: string; durationMinutes: number }>
  continuesNextWorkingDay: boolean
}

export type ApiError = {
  error: {
    code: string
    message: string
    fieldErrors?: Record<string, string>
  }
  requestId: string
}

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: Record<string, string> }

const LIMITS = {
  name: 100,
  email: 254,
  phone: 32,
  vehicle: 120,
  notes: 1500,
  policy: 100,
  conditionNotes: 1000,
  mediaFilename: 200,
} as const

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function normalizePhone(value: string): string {
  const trimmed = value.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''
  return trimmed.startsWith('+') || trimmed.startsWith('00')
    ? `+${digits.replace(/^00/, '')}`
    : digits
}

export function parsePublicBookingRequest(input: unknown): ValidationResult<PublicBookingRequest> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { success: false, errors: { request: 'Expected a JSON object.' } }
  }

  const source = input as Record<string, unknown>
  const name = text(source.name)
  const email = normalizeEmail(text(source.email))
  const phone = normalizePhone(text(source.phone))
  const vehicleCategoryId = text(source.vehicleCategoryId)
  const vehicleDescription = text(source.vehicleDescription)
  const requestedStart = text(source.requestedStart)
  const language = text(source.language)
  const customerNotes = text(source.customerNotes)
  const consentPolicyVersion = text(source.consentPolicyVersion)
  const idempotencyKey = text(source.idempotencyKey)
  const packageId = text(source.packageId)
  const company = text(source.company)
  const turnstileToken = text(source.turnstileToken)
  const serviceIds = Array.isArray(source.serviceIds)
    ? [...new Set(source.serviceIds.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean))]
    : []
  const errors: Record<string, string> = {}

  if (name.length < 2 || name.length > LIMITS.name) errors.name = 'Enter a valid full name.'
  if (email.length > LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.'
  if (phone.length > LIMITS.phone || phone.replace(/\D/g, '').length < 8) errors.phone = 'Enter a valid phone number.'
  if (!isUuid(vehicleCategoryId)) errors.vehicleCategoryId = 'Select a valid vehicle category.'
  if (vehicleDescription.length < 2 || vehicleDescription.length > LIMITS.vehicle) errors.vehicleDescription = 'Enter a valid vehicle description.'
  if ((!serviceIds.length && !packageId) || (serviceIds.length > 0 && Boolean(packageId))) errors.services = 'Choose services or one package.'
  if (serviceIds.length > 12 || serviceIds.some((id) => !isUuid(id))) errors.serviceIds = 'One or more services are invalid.'
  if (packageId && !isUuid(packageId)) errors.packageId = 'The selected package is invalid.'
  if (!requestedStart || Number.isNaN(Date.parse(requestedStart))) errors.requestedStart = 'Select a valid available time.'
  if (language !== 'en' && language !== 'lv' && language !== 'ru') errors.language = 'Select a supported language.'
  if (customerNotes.length > LIMITS.notes) errors.customerNotes = 'Use no more than 1500 characters.'
  if (source.consentAccepted !== true) errors.consentAccepted = 'Consent is required.'
  if (consentPolicyVersion !== CURRENT_CONSENT_POLICY_VERSION
    || consentPolicyVersion.length > LIMITS.policy) {
    errors.consentPolicyVersion = 'The consent policy version is invalid.'
  }
  if (!isUuid(idempotencyKey)) errors.idempotencyKey = 'The request identifier is invalid.'

  if (Object.keys(errors).length) return { success: false, errors }

  return {
    success: true,
    data: {
      name,
      email,
      phone,
      vehicleCategoryId,
      vehicleDescription,
      serviceIds,
      requestedStart: new Date(requestedStart).toISOString(),
      language: language as BookingLanguage,
      customerNotes: customerNotes || undefined,
      consentAccepted: true,
      consentPolicyVersion,
      idempotencyKey,
      packageId: packageId || undefined,
      company: company || undefined,
      turnstileToken: turnstileToken || undefined,
    },
  }
}

export function parsePublicReservationRequest(input: unknown): ValidationResult<PublicReservationRequest> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { success: false, errors: { request: 'Expected a JSON object.' } }
  }

  const source = input as Record<string, unknown>
  const name = text(source.name)
  const email = normalizeEmail(text(source.email))
  const phone = normalizePhone(text(source.phone))
  const vehicleCategoryId = text(source.vehicleCategoryId)
  const vehicleDescription = text(source.vehicleDescription)
  const requestedStart = text(source.requestedStart)
  const language = text(source.language)
  const customerNotes = text(source.customerNotes)
  const consentPolicyVersion = text(source.consentPolicyVersion)
  const idempotencyKey = text(source.idempotencyKey)
  const packageId = text(source.packageId)
  const company = text(source.company)
  const turnstileToken = text(source.turnstileToken)
  const overnightAcknowledged = source.overnightAcknowledged === true
  const conditionSource = source.condition && typeof source.condition === 'object' && !Array.isArray(source.condition)
    ? source.condition as Record<string, unknown>
    : {}
  const conditionLevelId = text(conditionSource.levelId)
  const conditionNotes = text(conditionSource.notes)
  const conditionIndicatorIds = Array.isArray(conditionSource.indicatorIds)
    ? [...new Set(conditionSource.indicatorIds.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean))]
    : []
  const mediaSource = Array.isArray(source.media) ? source.media : []
  const media = mediaSource.flatMap((entry): PublicMediaDescriptor[] => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const row = entry as Record<string, unknown>
    const clientId = text(row.clientId)
    const filename = text(row.filename)
    const mimeType = text(row.mimeType)
    const size = Number(row.size)
    if (!isUuid(clientId)
      || filename.length < 1 || filename.length > LIMITS.mediaFilename
      || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)
      || !Number.isInteger(size) || size < 1 || size > 8_388_608) return []
    return [{ clientId, filename, mimeType: mimeType as PublicMediaDescriptor['mimeType'], size }]
  })
  const serviceIds = Array.isArray(source.serviceIds)
    ? [...new Set(source.serviceIds.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean))]
    : []
  const errors: Record<string, string> = {}

  if (name.length < 2 || name.length > LIMITS.name) errors.name = 'Enter a valid full name.'
  if (email.length > LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.'
  if (phone.length > LIMITS.phone || phone.replace(/\D/g, '').length < 8) errors.phone = 'Enter a valid phone number.'
  if (!isUuid(vehicleCategoryId)) errors.vehicleCategoryId = 'Select a valid vehicle category.'
  if (vehicleDescription.length < 2 || vehicleDescription.length > LIMITS.vehicle) errors.vehicleDescription = 'Enter a valid vehicle description.'
  if ((!serviceIds.length && !packageId) || (serviceIds.length > 0 && Boolean(packageId))) errors.services = 'Choose services or one package.'
  if (serviceIds.length > 12 || serviceIds.some((id) => !isUuid(id))) errors.serviceIds = 'One or more services are invalid.'
  if (packageId && !isUuid(packageId)) errors.packageId = 'The selected package is invalid.'
  if (!requestedStart || Number.isNaN(Date.parse(requestedStart))) errors.requestedStart = 'Select a valid available time.'
  if (language !== 'en' && language !== 'lv' && language !== 'ru') errors.language = 'Select a supported language.'
  if (customerNotes.length > LIMITS.notes) errors.customerNotes = 'Use no more than 1500 characters.'
  if (source.consentAccepted !== true) errors.consentAccepted = 'Consent is required.'
  if (consentPolicyVersion !== CURRENT_CONSENT_POLICY_VERSION || consentPolicyVersion.length > LIMITS.policy) {
    errors.consentPolicyVersion = 'The consent policy version is invalid.'
  }
  if (!isUuid(idempotencyKey)) errors.idempotencyKey = 'The request identifier is invalid.'
  if (!isUuid(conditionLevelId)) errors.condition = 'Select a valid vehicle condition.'
  if (conditionIndicatorIds.length > 8 || conditionIndicatorIds.some((id) => !isUuid(id))) {
    errors.conditionIndicators = 'One or more condition indicators are invalid.'
  }
  if (conditionNotes.length > LIMITS.conditionNotes) errors.conditionNotes = 'Use no more than 1000 characters.'
  if (mediaSource.length > 6 || media.length !== mediaSource.length) errors.media = 'Choose up to six supported images of 8 MB or less.'

  if (Object.keys(errors).length) return { success: false, errors }

  return {
    success: true,
    data: {
      name,
      email,
      phone,
      vehicleCategoryId,
      vehicleDescription,
      serviceIds,
      requestedStart: new Date(requestedStart).toISOString(),
      language: language as BookingLanguage,
      customerNotes: customerNotes || undefined,
      consentAccepted: true,
      consentPolicyVersion,
      idempotencyKey,
      packageId: packageId || undefined,
      company: company || undefined,
      turnstileToken: turnstileToken || undefined,
      overnightAcknowledged,
      condition: {
        levelId: conditionLevelId,
        indicatorIds: conditionIndicatorIds,
        notes: conditionNotes || undefined,
      },
      media: media.length ? media : undefined,
    },
  }
}
