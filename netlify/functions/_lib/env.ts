export type ApprovalMode = 'automatic' | 'manual'

type RuntimeConfig = {
  supabaseUrl: string
  supabaseAnonKey: string
  serviceRoleKey: string
  publicSiteUrl: string
  approvalMode: ApprovalMode
  studioTimezone: string
  minNoticeHours: number
  maxDaysAhead: number
  cancellationHours: number
  bufferMinutes: number
  rateLimitSecret: string
  turnstileSecret?: string
}

function environment(): Record<string, string | undefined> {
  return (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> }
  }).process?.env ?? {}
}

function required(name: string): string {
  const value = environment()[name]?.trim()
  if (!value) throw new Error(`CONFIG_${name}`)
  return value
}

function positiveInteger(name: string, fallback: number): number {
  const value = environment()[name]
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`CONFIG_${name}`)
  return parsed
}

export function getRuntimeConfig(): RuntimeConfig {
  const approval = environment().BOOKING_APPROVAL_MODE ?? 'manual'
  if (approval !== 'automatic' && approval !== 'manual') throw new Error('CONFIG_BOOKING_APPROVAL_MODE')

  return {
    supabaseUrl: required('SUPABASE_URL').replace(/\/+$/, ''),
    supabaseAnonKey: required('SUPABASE_ANON_KEY'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    publicSiteUrl: required('PUBLIC_SITE_URL').replace(/\/+$/, ''),
    approvalMode: approval,
    studioTimezone: environment().STUDIO_TIMEZONE?.trim() || 'Europe/Riga',
    minNoticeHours: positiveInteger('BOOKING_MIN_NOTICE_HOURS', 24),
    maxDaysAhead: positiveInteger('BOOKING_MAX_DAYS_AHEAD', 90),
    cancellationHours: positiveInteger('BOOKING_CANCELLATION_HOURS', 24),
    bufferMinutes: positiveInteger('BOOKING_BUFFER_MINUTES', 30),
    rateLimitSecret: required('RATE_LIMIT_SECRET'),
    turnstileSecret: environment().TURNSTILE_SECRET_KEY?.trim() || undefined,
  }
}

export function getOptionalEnvironment(name: string): string | undefined {
  return environment()[name]?.trim() || undefined
}

export function getNotificationConfig() {
  const mode = getOptionalEnvironment('NOTIFICATION_MODE') ?? 'disabled'
  if (!['disabled', 'test', 'live'].includes(mode)) throw new Error('CONFIG_NOTIFICATION_MODE')
  return {
    mode: mode as 'disabled' | 'test' | 'live',
    apiKey: getOptionalEnvironment('RESEND_API_KEY'),
    fromEmail: getOptionalEnvironment('RESEND_FROM_EMAIL'),
    ownerEmail: getOptionalEnvironment('BOOKING_OWNER_EMAIL'),
    testRecipient: getOptionalEnvironment('NOTIFICATION_TEST_RECIPIENT'),
  }
}

export function getTelegramAuthConfig() {
  return {
    botToken: required('TELEGRAM_BOT_TOKEN'),
    sessionSecret: required('TELEGRAM_SESSION_SECRET'),
    authMaxAgeSeconds: positiveInteger('TELEGRAM_AUTH_MAX_AGE_SECONDS', 3_600),
    sessionTtlSeconds: positiveInteger('TELEGRAM_SESSION_TTL_SECONDS', 43_200),
  }
}

export function getTelegramSessionConfig() {
  return { sessionSecret: required('TELEGRAM_SESSION_SECRET') }
}

export function getTelegramBotConfig() {
  const runtime = getRuntimeConfig()
  const miniAppUrl = getOptionalEnvironment('TELEGRAM_MINI_APP_URL') ?? `${runtime.publicSiteUrl}/telegram`
  if (!miniAppUrl.startsWith('https://')) throw new Error('CONFIG_TELEGRAM_MINI_APP_URL')
  return {
    botToken: required('TELEGRAM_BOT_TOKEN'),
    botUsername: getOptionalEnvironment('TELEGRAM_BOT_USERNAME'),
    webhookSecret: required('TELEGRAM_WEBHOOK_SECRET'),
    miniAppUrl,
  }
}

export function getTelegramNotificationConfig() {
  const mode = getOptionalEnvironment('TELEGRAM_NOTIFICATION_MODE') ?? 'disabled'
  if (!['disabled', 'test', 'live'].includes(mode)) throw new Error('CONFIG_TELEGRAM_NOTIFICATION_MODE')
  return {
    mode: mode as 'disabled' | 'test' | 'live',
    botToken: getOptionalEnvironment('TELEGRAM_BOT_TOKEN'),
    testChatId: getOptionalEnvironment('TELEGRAM_TEST_CHAT_ID'),
  }
}
