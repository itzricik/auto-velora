import type { AvailabilitySlot, PublicBookingRequest, PublicBookingResult } from '../shared/contracts'

type AvailabilityResponse = {
  slots: AvailabilitySlot[]
  serverEstimate: { priceCents: number; durationMinutes: number }
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
    date: string
    vehicleCategoryId: string
    serviceIds: string[]
    packageId?: string
    language: string
  },
  signal?: AbortSignal,
): Promise<AvailabilityResponse> {
  const params = new URLSearchParams({
    date: query.date,
    vehicleCategoryId: query.vehicleCategoryId,
    timezone: 'Europe/Riga',
    language: query.language,
  })
  if (query.packageId) params.set('packageId', query.packageId)
  else params.set('serviceIds', query.serviceIds.join(','))
  const response = await fetch(`/api/availability?${params}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  })
  return parseResponse<AvailabilityResponse>(response)
}

export async function createApiBooking(request: PublicBookingRequest): Promise<PublicBookingResult> {
  const response = await fetch('/api/create-booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(request),
  })
  return parseResponse<PublicBookingResult>(response)
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
