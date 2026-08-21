export class SupabaseError extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly details?: string) {
    super(code)
  }
}

export type Database = { request<T>(path: string, init?: RequestInit): Promise<T> }

export function database(url: string, serviceRoleKey: string): Database {
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
      const value = await response.json().catch(() => ({})) as { code?: string; message?: string }
      if (!response.ok) throw new SupabaseError(response.status, value.code ?? 'SUPABASE_ERROR', value.message)
      return value as T
    },
  }
}

export function inFilter(values: string[]) {
  return `in.(${values.join(',')})`
}
