import type { AdminRuntimeConfig } from './env'
import type { Database } from './supabase'

export type AdminIdentity = { userId: string; displayName: string; role: 'admin' | 'staff' }

export async function requireAdmin(request: Request, config: AdminRuntimeConfig, db: Database): Promise<AdminIdentity> {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ') || authorization.length > 4096) throw new Error('ADMIN_UNAUTHENTICATED')
  const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: config.anonKey, Authorization: authorization },
  })
  if (!response.ok) throw new Error('ADMIN_UNAUTHENTICATED')
  const user = await response.json() as { id?: string }
  if (!user.id) throw new Error('ADMIN_UNAUTHENTICATED')
  const profiles = await db.request<Array<{ user_id: string; display_name: string; role: 'admin' | 'staff' }>>(
    `/rest/v1/admin_profiles?user_id=eq.${user.id}&active=eq.true&is_active=eq.true&select=user_id,display_name,role&limit=1`,
  )
  if (!profiles[0]) throw new Error('ADMIN_FORBIDDEN')
  return { userId: profiles[0].user_id, displayName: profiles[0].display_name, role: profiles[0].role }
}
