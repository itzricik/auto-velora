import type { OccupiedSlot, ScheduleRow } from './types'

export const SLOT_INTERVALS = [
  { start: '10:00', end: '12:00' },
  { start: '12:00', end: '14:00' },
  { start: '14:00', end: '16:00' },
  { start: '16:00', end: '18:00' },
  { start: '18:00', end: '20:00' },
  { start: '20:00', end: '22:00' },
] as const

export function normalizeTime(value: string): string {
  return value.slice(0, 5)
}

export function buildScheduleRows(occupied: OccupiedSlot[]): ScheduleRow[] {
  const byStart = new Map(occupied.map((slot) => [normalizeTime(slot.start_time), slot]))
  return SLOT_INTERVALS.map((interval) => {
    const slot = byStart.get(interval.start) ?? null
    return {
      ...interval,
      status: slot?.status ?? 'available',
      occupied: slot,
    }
  })
}

export function consecutiveIntervals(startTime: string, durationSlots: number) {
  const index = SLOT_INTERVALS.findIndex((slot) => slot.start === normalizeTime(startTime))
  if (index < 0 || !Number.isInteger(durationSlots) || durationSlots < 1 || index + durationSlots > SLOT_INTERVALS.length) {
    return []
  }
  return SLOT_INTERVALS.slice(index, index + durationSlots)
}

export function canOccupy(rows: ScheduleRow[], startTime: string, durationSlots: number, reservationId?: string): boolean {
  const requested = consecutiveIntervals(startTime, durationSlots)
  if (requested.length !== durationSlots) return false
  return requested.every(({ start }) => {
    const row = rows.find((candidate) => candidate.start === start)
    return row?.status === 'available' || row?.occupied?.reservation_id === reservationId
  })
}

export function todayInRiga(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Riga',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}
