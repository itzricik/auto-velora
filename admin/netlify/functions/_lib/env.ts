export type AdminRuntimeConfig = {
  supabaseUrl: string
  anonKey: string
  serviceRoleKey: string
  adminSiteUrl: string
}

function environment(): Record<string, string | undefined> {
  return (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
}

function required(name: string) {
  const value = environment()[name]?.trim()
  if (!value) throw new Error(`CONFIG_${name}`)
  return value
}

export function getConfig(): AdminRuntimeConfig {
  return {
    supabaseUrl: required('SUPABASE_URL').replace(/\/+$/, ''),
    anonKey: required('SUPABASE_ANON_KEY'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    adminSiteUrl: required('ADMIN_SITE_URL').replace(/\/+$/, ''),
  }
}
