import type { AvailabilitySlot, PublicBookingRequest, PublicBookingResult, PublicReservationRequest, PublicReservationResult } from '../shared/contracts'
import type { PublicCatalog } from '../shared/publicCatalog'

type AvailabilityResponse = {
  slots: AvailabilitySlot[]
  nearest: AvailabilitySlot | null
  serverEstimate: {
    priceCents: number
    durationMinutes: number
    priceMinCents: number
    priceMaxCents: number
    durationMinMinutes: number
    durationMaxMinutes: number
  }
  requestId: string
}

export class BookingApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(code)
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as {
    error?: { code?: string; fieldErrors?: Record<string, string> }
  }
  if (!response.ok) {
    throw new BookingApiError(
      response.status,
      body.error?.code ?? 'API_ERROR',
      body.error?.fieldErrors,
    )
  }
  return body as T
}

export async function fetchAvailability(
  query: {
    date?: string
    vehicleCategoryId: string
    serviceIds: string[]
    packageId?: string
    language: string
    conditionLevelId: string
    conditionIndicatorIds: string[]
  },
  signal?: AbortSignal,
): Promise<AvailabilityResponse> {
  const params = new URLSearchParams({
    vehicleCategoryId: query.vehicleCategoryId,
    timezone: 'Europe/Riga',
    language: query.language,
    conditionLevelId: query.conditionLevelId,
  })
  if (query.date) params.set('date', query.date)
  if (query.packageId) params.set('packageId', query.packageId)
  else params.set('serviceIds', query.serviceIds.join(','))
  if (query.conditionIndicatorIds.length) params.set('conditionIndicatorIds', query.conditionIndicatorIds.join(','))
  const response = await fetch(`/api/availability?${params}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  })
  return parseResponse<AvailabilityResponse>(response)
}

export async function fetchPublicCatalog(signal?: AbortSignal): Promise<PublicCatalog> {
  const response = await fetch('/api/catalog', { headers: { Accept: 'application/json' }, signal })
  return parseResponse<PublicCatalog>(response)
}

export async function finalizeReservationMedia(input: {
  mediaId: string
  finalizeToken: string
}): Promise<void> {
  const response = await fetch('/api/reservation-media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ action: 'finalize', ...input }),
  })
  await parseResponse(response)
}

export function uploadReservationMedia(
  upload: PublicReservationResult['mediaUploads'][number],
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL(upload.uploadUrl)
    if (!url.searchParams.has('token')) url.searchParams.set('token', upload.uploadToken)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url.toString())
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100)
        resolve()
      } else reject(new BookingApiError(xhr.status, 'MEDIA_UPLOAD_FAILED'))
    })
    xhr.addEventListener('error', () => reject(new BookingApiError(0, 'MEDIA_UPLOAD_FAILED')))
    xhr.addEventListener('abort', () => reject(new DOMException('Upload aborted', 'AbortError')))
    xhr.send(file)
  })
}

export async function createApiBooking(request: PublicBookingRequest): Promise<PublicBookingResult> {
  const response = await fetch('/api/create-booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(request),
  })
  return parseResponse<PublicBookingResult>(response)
}

export async function createApiReservation(request: PublicReservationRequest): Promise<PublicReservationResult> {
  const response = await fetch('/api/create-reservation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(request),
  })
  return parseResponse<PublicReservationResult>(response)
}

export async function fetchBookingStatus(reference: string, token: string) {
  const params = new URLSearchParams({ reference, token })
  const response = await fetch(`/api/booking-status?${params}`, {
    headers: { Accept: 'application/json' },
  })
  return parseResponse<{
    reference: string
    status: string
    start: string
    end: string
    estimatedPriceCents: number
    estimatedDurationMinutes: number
    vehicleDescription: string
    services: Array<{ service_name_snapshot: string }>
    canCancel: boolean
  }>(response)
}

export async function cancelApiBooking(reference: string, token: string, reason: string) {
  const response = await fetch('/api/booking-cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ reference, token, reason }),
  })
  return parseResponse<{ reference: string; status: 'cancelled'; start: string }>(response)
}
