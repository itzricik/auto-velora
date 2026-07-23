type SupabaseSession = {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

const SESSION_KEY = 'velora-admin-session'

function config() {
  const url = (import.meta.env.VITE_SUPABASE_URL
    || (import.meta.env.MODE === 'e2e' ? 'https://supabase.test' : '')).replace(/\/+$/, '')
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    || (import.meta.env.MODE === 'e2e' ? 'e2e-anon-key' : '')
  if (!url || !anonKey) throw new Error('ADMIN_AUTH_NOT_CONFIGURED')
  return { url, anonKey }
}

function readSession(): SupabaseSession | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as SupabaseSession | null
    return parsed?.accessToken && parsed.refreshToken ? parsed : null
  } catch {
    return null
  }
}

function saveSession(result: { access_token: string; refresh_token: string; expires_in: number }): SupabaseSession {
  const session = {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expiresAt: Date.now() + result.expires_in * 1000,
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

async function tokenRequest(body: Record<string, string>, grantType: 'password' | 'refresh_token') {
  const { url, anonKey } = config()
  const response = await fetch(`${url}/auth/v1/token?grant_type=${grantType}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({})) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }
  if (!response.ok || !result.access_token || !result.refresh_token || !result.expires_in) {
    throw new Error('ADMIN_SIGN_IN_FAILED')
  }
  return saveSession(result as { access_token: string; refresh_token: string; expires_in: number })
}

export async function signInAdmin(email: string, password: string): Promise<void> {
  await tokenRequest({ email: email.trim().toLowerCase(), password }, 'password')
}

export async function getAdminAccessToken(): Promise<string | null> {
  const session = readSession()
  if (!session) return null
  if (session.expiresAt > Date.now() + 60_000) return session.accessToken
  try {
    return (await tokenRequest({ refresh_token: session.refreshToken }, 'refresh_token')).accessToken
  } catch {
    sessionStorage.removeItem(SESSION_KEY)
    return null
  }
}

export function hasAdminSession(): boolean {
  return Boolean(readSession())
}

export function signOutAdmin(): void {
  sessionStorage.removeItem(SESSION_KEY)
}
