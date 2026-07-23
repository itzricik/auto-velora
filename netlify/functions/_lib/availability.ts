import type { AvailabilitySlot } from '../../../src/shared/contracts'

export type HoursRow = {
  weekday: number
  opens_at: string | null
  closes_at: string | null
  is_closed: boolean
}

export type BusyPeriod = {
  work_bay_id: string | null
  starts_at: string
  ends_at: string
}

export type AvailabilityInput = {
  localDate: string
  timezone: string
  durationMinutes: number
  bufferMinutes: number
  slotIntervalMinutes: number
  minNoticeHours: number
  maxDaysAhead: number
  bays: string[]
  businessHours: HoursRow[]
  blockedPeriods: BusyPeriod[]
  bookings: BusyPeriod[]
  now?: Date
}

function partsInZone(date: Date, timezone: string): Record<string, number> {
  const values: Record<string, number> = {}
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = Number(part.value)
  }
  return values
}

export function zonedLocalToUtc(localDate: string, time: string, timezone: string): Date | null {
  const [year, month, day] = localDate.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null
  const wantedUtc = Date.UTC(year, month - 1, day, hour, minute)
  let candidate = new Date(wantedUtc)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = partsInZone(candidate, timezone)
    const represented = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute)
    candidate = new Date(candidate.getTime() + wantedUtc - represented)
  }

  const check = partsInZone(candidate, timezone)
  return check.year === year && check.month === month && check.day === day
    && check.hour === hour && check.minute === minute
    ? candidate
    : null
}

function minutes(time: string): number {
  const [hours, mins] = time.slice(0, 5).split(':').map(Number)
  return hours * 60 + mins
}

function timeFromMinutes(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

function overlaps(start: number, end: number, period: BusyPeriod): boolean {
  return start < Date.parse(period.ends_at) && end > Date.parse(period.starts_at)
}

export function generateAvailabilitySlots(input: AvailabilityInput): AvailabilitySlot[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.localDate) || !input.bays.length) return []
  const now = input.now ?? new Date()
  const requestedDay = new Date(`${input.localDate}T00:00:00.000Z`)
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const daysAhead = Math.floor((requestedDay.getTime() - today.getTime()) / 86_400_000)
  if (daysAhead < 0 || daysAhead > input.maxDaysAhead) return []

  const weekday = requestedDay.getUTCDay()
  const hours = input.businessHours.find((entry) => entry.weekday === weekday)
  if (!hours || hours.is_closed || !hours.opens_at || !hours.closes_at) return []

  const slots: AvailabilitySlot[] = []
  const occupancyMinutes = input.durationMinutes + input.bufferMinutes
  const opening = minutes(hours.opens_at)
  const closing = minutes(hours.closes_at)
  const notBefore = now.getTime() + input.minNoticeHours * 3_600_000

  for (let localMinute = opening; localMinute + occupancyMinutes <= closing; localMinute += input.slotIntervalMinutes) {
    const startDate = zonedLocalToUtc(input.localDate, timeFromMinutes(localMinute), input.timezone)
    if (!startDate || startDate.getTime() < notBefore) continue
    const end = startDate.getTime() + occupancyMinutes * 60_000
    const availableBays = input.bays.filter((bay) => {
      const unavailable = [...input.blockedPeriods, ...input.bookings]
      return !unavailable.some((period) => (
        (period.work_bay_id === null || period.work_bay_id === bay)
        && overlaps(startDate.getTime(), end, period)
      ))
    })
    if (!availableBays.length) continue
    slots.push({
      start: startDate.toISOString(),
      end: new Date(end).toISOString(),
      displayTime: timeFromMinutes(localMinute),
      estimatedDurationMinutes: input.durationMinutes,
      availableBayCount: availableBays.length,
    })
  }

  return slots
}
