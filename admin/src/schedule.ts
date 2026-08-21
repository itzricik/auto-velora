import type { BayCell, ScheduleBlock, ScheduleRow, ScheduleSegment, WorkBay } from './types'

const minute = 60_000
export function scheduleStartTimes(opensAt = '10:00', closesAt = '20:00', intervalMinutes = 30) {
  const [openHour, openMinute] = opensAt.slice(0, 5).split(':').map(Number)
  const [closeHour, closeMinute] = closesAt.slice(0, 5).split(':').map(Number)
  const opening = openHour * 60 + openMinute
  const closing = closeHour * 60 + closeMinute
  if (!Number.isFinite(opening) || !Number.isFinite(closing) || opening >= closing || intervalMinutes < 5) return []
  return Array.from({ length: Math.ceil((closing - opening) / intervalMinutes) }, (_, index) => {
    const total = opening + index * intervalMinutes
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  })
}

export const START_TIMES = scheduleStartTimes()

function endTime(start: string, intervalMinutes: number) {
  const [hour, minutes] = start.split(':').map(Number)
  const total = hour * 60 + minutes + intervalMinutes
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function localTime(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Riga', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
}

function overlaps(start: string, end: string, candidateStart: string, candidateEnd: string) {
  return Date.parse(start) < Date.parse(candidateEnd) && Date.parse(end) > Date.parse(candidateStart)
}

function utcAtRiga(date: string, time: string) {
  const [hour, minutes] = time.split(':').map(Number)
  const rough = new Date(`${date}T${time}:00.000Z`)
  const represented = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Riga', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(rough)
  const [representedHour, representedMinute] = represented.split(':').map(Number)
  return new Date(rough.getTime() + ((hour * 60 + minutes) - (representedHour * 60 + representedMinute)) * minute).toISOString()
}

export function buildScheduleRows(date: string, bays: WorkBay[], segments: ScheduleSegment[], blocks: ScheduleBlock[], opensAt = '10:00', closesAt = '20:00', intervalMinutes = 30): ScheduleRow[] {
  return scheduleStartTimes(opensAt, closesAt, intervalMinutes).map((start) => {
    const end = endTime(start, intervalMinutes)
    const startIso = utcAtRiga(date, start)
    const endIso = utcAtRiga(date, end)
    const cells: Record<string, BayCell> = Object.fromEntries(bays.map((bay): [string, BayCell] => {
      if (!bay.is_active) return [bay.id, { status: 'inactive', segment: null, block: null }]
      const segment = segments.find((entry) => entry.work_bay_id === bay.id && overlaps(startIso, endIso, entry.segment_start, entry.segment_end)) ?? null
      const block = blocks.find((entry) => (entry.work_bay_id === null || entry.work_bay_id === bay.id) && overlaps(startIso, endIso, entry.starts_at, entry.ends_at)) ?? null
      return [bay.id, { status: segment ? 'reservation' : block ? 'blocked' : 'available', segment, block }]
    }))
    return { start, end, cells }
  })
}

export function todayInRiga(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Riga', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}

export function localStart(date: string, time: string) { return utcAtRiga(date, time) }
export function displayTime(iso: string | null) { return iso ? localTime(iso) : '—' }
