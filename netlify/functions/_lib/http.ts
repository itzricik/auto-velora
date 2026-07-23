import type { ApiError } from '../../../src/shared/contracts'

export const MAX_REQUEST_BYTES = 20_000

export function requestId(): string {
  return crypto.randomUUID()
}

export function json(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...Object.fromEntries(new Headers(extraHeaders)),
    },
  })
}

export function apiError(status: number, code: string, message: string, id: string, fieldErrors?: Record<string, string>): Response {
  const body: ApiError = { error: { code, message, fieldErrors }, requestId: id }
  return json(body, status)
}

export function enforceOrigin(request: Request, publicSiteUrl: string): Response | null {
  const origin = request.headers.get('origin')
  if (!origin || origin === publicSiteUrl || origin.startsWith('http://localhost:')) return null
  return apiError(403, 'ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.', requestId())
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > MAX_REQUEST_BYTES) throw new Error('BODY_TOO_LARGE')
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) throw new Error('BODY_TOO_LARGE')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('INVALID_JSON')
  }
}
