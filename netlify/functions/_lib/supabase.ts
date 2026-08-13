export class SupabaseError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: string

  constructor(
    status: number,
    code: string,
    details?: string,
  ) {
    super(code)
    this.status = status
    this.code = code
    this.details = details
  }
}

export type SupabaseServer = {
  request<T>(path: string, init?: RequestInit): Promise<T>
}

export function createSupabaseServer(url: string, serviceRoleKey: string): SupabaseServer {
  return {
    async request<T>(path: string, init: RequestInit = {}): Promise<T> {
      const response = await fetch(`${url}${path}`, {
        ...init,
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          ...Object.fromEntries(new Headers(init.headers)),
        },
      })
      const body = await response.json().catch(() => ({})) as Record<string, unknown>
      if (!response.ok) {
        throw new SupabaseError(
          response.status,
          typeof body.code === 'string' ? body.code : 'SUPABASE_ERROR',
          typeof body.message === 'string' ? body.message : undefined,
        )
      }
      return body as T
    },
  }
}

export function inFilter(values: string[]): string {
  return `in.(${values.join(',')})`
}
