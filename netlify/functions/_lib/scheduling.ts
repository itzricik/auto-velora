import type { BookingLanguage } from '../../../src/shared/contracts'
import { calculateServerEstimate } from '../../../src/shared/pricing'
import { generateAvailabilitySlots, type BusyPeriod, type HoursRow } from './availability'
import { loadCatalogSelection } from './repository'
import type { SupabaseServer } from './supabase'

export type SchedulingQuery = {
  localDate: string
  vehicleCategoryId: string
  serviceIds: string[]
  packageId?: string
  timezone: string
  language: BookingLanguage
}

function nextDate(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
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
  const dayStart = `${query.localDate}T00:00:00.000Z`
  const dayEnd = `${nextDate(query.localDate)}T23:59:59.999Z`
  const weekday = new Date(dayStart).getUTCDay()

  const [bays, hours, blocks, bookings] = await Promise.all([
    db.request<Array<{ id: string }>>('/rest/v1/work_bays?is_active=eq.true&select=id&order=code.asc'),
    db.request<HoursRow[]>(`/rest/v1/business_hours?weekday=eq.${weekday}&select=weekday,opens_at,closes_at,is_closed&order=effective_from.desc.nullslast`),
    db.request<BusyPeriod[]>(`/rest/v1/blocked_periods?starts_at=lt.${encodeURIComponent(dayEnd)}&ends_at=gt.${encodeURIComponent(dayStart)}&select=work_bay_id,starts_at,ends_at`),
    db.request<BusyPeriod[]>(`/rest/v1/booking_requests?status=in.(confirmed,in_progress)&starts_at=lt.${encodeURIComponent(dayEnd)}&ends_at=gt.${encodeURIComponent(dayStart)}&select=work_bay_id,starts_at,ends_at`),
  ])

  return {
    estimate,
    slots: generateAvailabilitySlots({
      localDate: query.localDate,
      timezone: query.timezone,
      durationMinutes: estimate.durationMinutes,
      bufferMinutes: options.bufferMinutes,
      slotIntervalMinutes: 30,
      minNoticeHours: options.minNoticeHours,
      maxDaysAhead: options.maxDaysAhead,
      bays: bays.map((bay) => bay.id),
      businessHours: hours,
      blockedPeriods: blocks,
      bookings,
      now: options.now,
    }),
  }
}
