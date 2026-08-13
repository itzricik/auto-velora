type Session = { accessToken: string; refreshToken: string; expiresAt: number }

const SESSION_KEY = 'velora-admin-session-v2'

function configuration() {
  const url = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
  if (!url || !anonKey) throw new Error('AUTH_NOT_CONFIGURED')
  return { url, anonKey }
}

function readSession(): Session | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as Session | null
    return value?.accessToken && value.refreshToken ? value : null
  } catch {
    return null
  }
}

function saveSession(value: { access_token: string; refresh_token: string; expires_in: number }): Session {
  const session = {
    accessToken: value.access_token,
    refreshToken: value.refresh_token,
    expiresAt: Date.now() + value.expires_in * 1000,
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

async function tokenRequest(body: Record<string, string>, grantType: 'password' | 'refresh_token') {
  const { url, anonKey } = configuration()
  const response = await fetch(`${url}/auth/v1/token?grant_type=${grantType}`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({})) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }
  if (!response.ok || !result.access_token || !result.refresh_token || !result.expires_in) {
    throw new Error('SIGN_IN_FAILED')
  }
  return saveSession(result as { access_token: string; refresh_token: string; expires_in: number })
}

export async function signIn(email: string, password: string) {
  await tokenRequest({ email: email.trim().toLowerCase(), password }, 'password')
}

export async function accessToken(): Promise<string | null> {
  const session = readSession()
  if (!session) return null
  if (session.expiresAt > Date.now() + 60_000) return session.accessToken
  try {
    return (await tokenRequest({ refresh_token: session.refreshToken }, 'refresh_token')).accessToken
  } catch {
    signOut()
    return null
  }
}

export function hasSession() {
  return Boolean(readSession())
}

export function signOut() {
  sessionStorage.removeItem(SESSION_KEY)
}
