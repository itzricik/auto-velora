import type { AvailabilitySlot } from '../../../src/shared/contracts'

export type HoursRow = {
  weekday: number
  opens_at: string | null
  closes_at: string | null
  is_closed: boolean
}

export type HoursException = {
  exception_date: string
  opens_at: string | null
  closes_at: string | null
  is_closed: boolean
}

export type BusyPeriod = {
  work_bay_id: string | null
  starts_at?: string
  ends_at?: string
  segment_start?: string
  segment_end?: string
}

export type WorkSegment = {
  start: string
  end: string
  durationMinutes: number
}

export type AvailabilityInput = {
  localDate: string
  timezone: string
  durationMinutes: number
  slotIntervalMinutes: number
  minNoticeHours: number
  maxDaysAhead: number
  bays: string[]
  businessHours: HoursRow[]
  exceptions: HoursException[]
  blockedPeriods: BusyPeriod[]
  reservationSegments: BusyPeriod[]
  now?: Date
}

function partsInZone(date: Date, timezone: string): Record<string, number> {
  const values: Record<string, number> = {}
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  for (const part of parts) if (part.type !== 'literal') values[part.type] = Number(part.value)
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
    && check.hour === hour && check.minute === minute ? candidate : null
}

function minutes(time: string): number {
  const [hours, mins] = time.slice(0, 5).split(':').map(Number)
  return hours * 60 + mins
}

function timeFromMinutes(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}

function weekday(date: string) {
  return new Date(`${date}T12:00:00.000Z`).getUTCDay()
}

function effectiveHours(date: string, hours: HoursRow[], exceptions: HoursException[]) {
  const exception = exceptions.find((entry) => entry.exception_date === date)
  if (exception) return exception
  return hours.find((entry) => entry.weekday === weekday(date))
}

export function calculateWorkSegments(input: {
  localDate: string
  startMinute: number
  durationMinutes: number
  timezone: string
  businessHours: HoursRow[]
  exceptions: HoursException[]
}): WorkSegment[] {
  const segments: WorkSegment[] = []
  let date = input.localDate
  let cursorMinute = input.startMinute
  let remaining = input.durationMinutes
  let guard = 0

  while (remaining > 0 && guard < 3660) {
    guard += 1
    const hours = effectiveHours(date, input.businessHours, input.exceptions)
    if (!hours || hours.is_closed || !hours.opens_at || !hours.closes_at) {
      date = addDays(date, 1)
      cursorMinute = 0
      continue
    }
    const opening = minutes(hours.opens_at)
    const closing = minutes(hours.closes_at)
    cursorMinute = Math.max(cursorMinute, opening)
    if (cursorMinute >= closing) {
      date = addDays(date, 1)
      cursorMinute = 0
      continue
    }
    const take = Math.min(remaining, closing - cursorMinute)
    const start = zonedLocalToUtc(date, timeFromMinutes(cursorMinute), input.timezone)
    const end = zonedLocalToUtc(date, timeFromMinutes(cursorMinute + take), input.timezone)
    if (!start || !end) return []
    segments.push({ start: start.toISOString(), end: end.toISOString(), durationMinutes: take })
    remaining -= take
    date = addDays(date, 1)
    cursorMinute = 0
  }
  return remaining === 0 ? segments : []
}

function periodTimes(period: BusyPeriod) {
  return {
    start: Date.parse(period.segment_start ?? period.starts_at ?? ''),
    end: Date.parse(period.segment_end ?? period.ends_at ?? ''),
  }
}

function overlaps(segment: WorkSegment, period: BusyPeriod): boolean {
  const busy = periodTimes(period)
  return Date.parse(segment.start) < busy.end && Date.parse(segment.end) > busy.start
}

export function generateAvailabilitySlots(input: AvailabilityInput): AvailabilitySlot[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.localDate) || !input.bays.length || input.durationMinutes <= 0) return []
  const now = input.now ?? new Date()
  const todayParts = partsInZone(now, input.timezone)
  const today = `${todayParts.year}-${String(todayParts.month).padStart(2, '0')}-${String(todayParts.day).padStart(2, '0')}`
  const requestedDay = new Date(`${input.localDate}T12:00:00.000Z`)
  const first = new Date(`${today}T12:00:00.000Z`)
  const daysAhead = Math.round((requestedDay.getTime() - first.getTime()) / 86_400_000)
  if (daysAhead < 0 || daysAhead > input.maxDaysAhead) return []
  const startHours = effectiveHours(input.localDate, input.businessHours, input.exceptions)
  if (!startHours || startHours.is_closed || !startHours.opens_at || !startHours.closes_at) return []

  const slots: AvailabilitySlot[] = []
  const opening = minutes(startHours.opens_at)
  const closing = minutes(startHours.closes_at)
  const notBefore = now.getTime() + input.minNoticeHours * 3_600_000
  const busyPeriods = [...input.blockedPeriods, ...input.reservationSegments]

  for (let localMinute = opening; localMinute < closing; localMinute += input.slotIntervalMinutes) {
    const segments = calculateWorkSegments({
      localDate: input.localDate,
      startMinute: localMinute,
      durationMinutes: input.durationMinutes,
      timezone: input.timezone,
      businessHours: input.businessHours,
      exceptions: input.exceptions,
    })
    if (!segments.length || Date.parse(segments[0].start) < notBefore) continue
    const availableBays = input.bays.filter((bay) => !segments.some((segment) => busyPeriods.some((period) => (
      (period.work_bay_id === null || period.work_bay_id === bay) && overlaps(segment, period)
    ))))
    if (!availableBays.length) continue
    slots.push({
      start: segments[0].start,
      end: segments.at(-1)!.end,
      displayTime: timeFromMinutes(localMinute),
      estimatedDurationMinutes: input.durationMinutes,
      availableBayCount: availableBays.length,
      segments,
      continuesNextWorkingDay: segments.length > 1,
    })
  }
  return slots
}
