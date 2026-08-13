export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export function error(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status)
}

export function enforceOrigin(request: Request, expected: string): Response | null {
  const origin = request.headers.get('origin')
  if (origin && origin.replace(/\/+$/, '') !== expected) return error(403, 'ORIGIN_REJECTED', 'Origin not allowed.')
  return null
}

export async function body(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > 32_000) throw new Error('BODY_TOO_LARGE')
  const value = await request.json().catch(() => null)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_JSON')
  return value as Record<string, unknown>
}
