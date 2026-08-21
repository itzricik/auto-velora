import type { AvailabilitySlot, BookingLanguage } from '../../../src/shared/contracts'
import { calculateServerEstimate } from '../../../src/shared/pricing'
import { loadCatalogSelection } from './repository'
import type { SupabaseServer } from './supabase'

export type SchedulingQuery = {
  localDate?: string
  vehicleCategoryId: string
  serviceIds: string[]
  packageId?: string
  timezone: string
  language: BookingLanguage
}

type DatabasePlan = {
  start: string
  end: string
  durationMinutes: number
  availableBayCount: number
  segments: Array<{ segment_start: string; segment_end: string; duration_minutes: number }>
}

type DatabaseAvailability = {
  durationMinutes: number
  nearest: DatabasePlan | null
  slots: DatabasePlan[]
}

function localDate(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Riga', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value))
}

function publicPlan(plan: DatabasePlan, language: BookingLanguage): AvailabilitySlot {
  return {
    start: plan.start,
    end: plan.end,
    displayTime: new Intl.DateTimeFormat(language === 'lv' ? 'lv-LV' : language === 'ru' ? 'ru-RU' : 'en-GB', {
      timeZone: 'Europe/Riga', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(plan.start)),
    estimatedDurationMinutes: plan.durationMinutes,
    availableBayCount: plan.availableBayCount,
    segments: plan.segments.map((segment) => ({
      start: segment.segment_start,
      end: segment.segment_end,
      durationMinutes: segment.duration_minutes,
    })),
    continuesNextWorkingDay: localDate(plan.start) !== localDate(plan.end),
  }
}

export async function getAvailableSlots(
  db: SupabaseServer,
  query: SchedulingQuery,
  options: {
    studioTimezone: string
    bufferMinutes: number
    minNoticeHours: number
    maxDaysAhead: number
    now?: Date
  },
) {
  if (query.timezone !== options.studioTimezone) throw new Error('UNSUPPORTED_TIMEZONE')
  const catalog = await loadCatalogSelection(db, query)
  const estimate = calculateServerEstimate(catalog)
  const now = options.now ?? new Date()
  const notBefore = new Date(now.getTime() + Math.max(0, options.minNoticeHours) * 3_600_000)
  const result = await db.request<DatabaseAvailability>('/rest/v1/rpc/scheduling_availability', {
    method: 'POST',
    body: JSON.stringify({
      p_duration_minutes: estimate.durationMinutes,
      p_date: query.localDate ?? null,
      p_not_before: notBefore.toISOString(),
      p_max_days: options.maxDaysAhead,
      p_increment_minutes: null,
    }),
  })

  return {
    estimate,
    nearest: result.nearest ? publicPlan(result.nearest, query.language) : null,
    slots: result.slots.map((slot) => publicPlan(slot, query.language)),
  }
}
