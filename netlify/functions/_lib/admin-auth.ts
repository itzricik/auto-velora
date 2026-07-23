import type { SupabaseServer } from './supabase'

export type AdminIdentity = {
  userId: string
  role: 'admin' | 'staff'
  displayName: string
}

export async function requireAdmin(
  request: Request,
  input: {
    supabaseUrl: string
    anonKey: string
    db: SupabaseServer
  },
): Promise<AdminIdentity> {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ') || authorization.length > 4096) {
    throw new Error('ADMIN_UNAUTHENTICATED')
  }
  const response = await fetch(`${input.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: input.anonKey,
      Authorization: authorization,
    },
  })
  if (!response.ok) throw new Error('ADMIN_UNAUTHENTICATED')
  const user = await response.json() as { id?: string }
  if (!user.id) throw new Error('ADMIN_UNAUTHENTICATED')
  const profiles = await input.db.request<Array<{
    user_id: string
    role: 'admin' | 'staff'
    display_name: string
    is_active: boolean
  }>>(`/rest/v1/admin_profiles?user_id=eq.${user.id}&is_active=eq.true&select=user_id,role,display_name,is_active&limit=1`)
  const profile = profiles[0]
  if (!profile) throw new Error('ADMIN_FORBIDDEN')
  return {
    userId: profile.user_id,
    role: profile.role,
    displayName: profile.display_name,
  }
}
