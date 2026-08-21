import { describe, expect, it } from 'vitest'
import { calculateWorkSegments, generateAvailabilitySlots, zonedLocalToUtc } from './availability'

const hours = Array.from({ length: 7 }, (_, weekday) => ({ weekday, opens_at: '10:00', closes_at: '20:00', is_closed: false }))
const now = new Date('2030-07-01T00:00:00.000Z')
const baseAvailability = {
  localDate: '2030-07-14', timezone: 'Europe/Riga', slotIntervalMinutes: 30,
  minNoticeHours: 0, maxDaysAhead: 90, businessHours: hours, exceptions: [],
  blockedPeriods: [], now,
}

describe('duration-based availability', () => {
  it('converts Riga local time to UTC and handles daylight-saving gaps', () => {
    expect(zonedLocalToUtc('2030-01-02', '10:00', 'Europe/Riga')?.toISOString()).toBe('2030-01-02T08:00:00.000Z')
    expect(zonedLocalToUtc('2026-03-29', '03:30', 'Europe/Riga')).toBeNull()
  })

  it('splits work at closing and resumes on the next open day', () => {
    expect(calculateWorkSegments({ localDate: '2030-01-02', startMinute: 18 * 60, durationMinutes: 360, timezone: 'Europe/Riga', businessHours: hours, exceptions: [] })).toEqual([
      { start: '2030-01-02T16:00:00.000Z', end: '2030-01-02T18:00:00.000Z', durationMinutes: 120 },
      { start: '2030-01-03T08:00:00.000Z', end: '2030-01-03T12:00:00.000Z', durationMinutes: 240 },
    ])
  })

  it('skips a closed exception day', () => {
    const result = calculateWorkSegments({ localDate: '2030-01-02', startMinute: 18 * 60, durationMinutes: 360, timezone: 'Europe/Riga', businessHours: hours, exceptions: [{ exception_date: '2030-01-03', opens_at: null, closes_at: null, is_closed: true }] })
    expect(result.at(-1)?.start).toBe('2030-01-04T08:00:00.000Z')
  })

  it('does not combine free time from different bays', () => {
    const slots = generateAvailabilitySlots({
      localDate: '2030-01-02', timezone: 'Europe/Riga', durationMinutes: 240,
      slotIntervalMinutes: 30, minNoticeHours: 0, maxDaysAhead: 90,
      bays: ['bay-1', 'bay-2'], businessHours: hours, exceptions: [], blockedPeriods: [],
      reservationSegments: [
        { work_bay_id: 'bay-1', segment_start: '2030-01-02T09:00:00.000Z', segment_end: '2030-01-02T11:00:00.000Z' },
        { work_bay_id: 'bay-2', segment_start: '2030-01-02T11:00:00.000Z', segment_end: '2030-01-02T13:00:00.000Z' },
      ],
      now: new Date('2029-12-01T00:00:00.000Z'),
    })
    expect(slots.some((slot) => slot.displayTime === '11:00')).toBe(false)
  })

  it('reports three-way capacity and half-open adjacency', () => {
    const slots = generateAvailabilitySlots({
      localDate: '2030-01-02', timezone: 'Europe/Riga', durationMinutes: 120,
      slotIntervalMinutes: 30, minNoticeHours: 0, maxDaysAhead: 90,
      bays: ['bay-1', 'bay-2', 'bay-3'], businessHours: hours, exceptions: [], blockedPeriods: [],
      reservationSegments: [{ work_bay_id: 'bay-1', segment_start: '2030-01-02T08:00:00.000Z', segment_end: '2030-01-02T10:00:00.000Z' }],
      now: new Date('2029-12-01T00:00:00.000Z'),
    })
    expect(slots.find((slot) => slot.displayTime === '10:00')?.availableBayCount).toBe(2)
    expect(slots.find((slot) => slot.displayTime === '12:00')?.availableBayCount).toBe(3)
  })

  it('case 1 — creates one 12:00–16:00 segment for 240 minutes', () => {
    expect(calculateWorkSegments({ localDate: '2030-07-14', startMinute: 12 * 60, durationMinutes: 240, timezone: 'Europe/Riga', businessHours: hours, exceptions: [] })).toEqual([
      { start: '2030-07-14T09:00:00.000Z', end: '2030-07-14T13:00:00.000Z', durationMinutes: 240 },
    ])
  })

  it('case 2 — continues six hours overnight on the same bay plan', () => {
    expect(calculateWorkSegments({ localDate: '2030-07-14', startMinute: 18 * 60, durationMinutes: 360, timezone: 'Europe/Riga', businessHours: hours, exceptions: [] })).toEqual([
      { start: '2030-07-14T15:00:00.000Z', end: '2030-07-14T17:00:00.000Z', durationMinutes: 120 },
      { start: '2030-07-15T07:00:00.000Z', end: '2030-07-15T11:00:00.000Z', durationMinutes: 240 },
    ])
  })

  it('cases 3 and 4 — allows three simultaneous bays, rejects a fourth, and keeps bays independent', () => {
    const occupied = ['bay-1', 'bay-2'].map((work_bay_id) => ({ work_bay_id, segment_start: '2030-07-14T09:00:00.000Z', segment_end: '2030-07-14T13:00:00.000Z' }))
    const withOneBay = generateAvailabilitySlots({ ...baseAvailability, durationMinutes: 240, bays: ['bay-1', 'bay-2', 'bay-3'], reservationSegments: occupied })
    expect(withOneBay.find((slot) => slot.displayTime === '12:00')?.availableBayCount).toBe(1)
    const full = generateAvailabilitySlots({ ...baseAvailability, durationMinutes: 240, bays: ['bay-1', 'bay-2', 'bay-3'], reservationSegments: [...occupied, { work_bay_id: 'bay-3', segment_start: '2030-07-14T09:00:00.000Z', segment_end: '2030-07-14T13:00:00.000Z' }] })
    expect(full.some((slot) => slot.displayTime === '12:00')).toBe(false)
  })

  it('case 5 — transfers 840 minutes to the next day and completes at 20:00', () => {
    expect(calculateWorkSegments({ localDate: '2030-07-14', startMinute: 16 * 60, durationMinutes: 840, timezone: 'Europe/Riga', businessHours: hours, exceptions: [] })).toEqual([
      { start: '2030-07-14T13:00:00.000Z', end: '2030-07-14T17:00:00.000Z', durationMinutes: 240 },
      { start: '2030-07-15T07:00:00.000Z', end: '2030-07-15T17:00:00.000Z', durationMinutes: 600 },
    ])
  })

  it('case 6 — skips a closed next day', () => {
    expect(calculateWorkSegments({ localDate: '2030-07-14', startMinute: 18 * 60, durationMinutes: 360, timezone: 'Europe/Riga', businessHours: hours, exceptions: [{ exception_date: '2030-07-15', opens_at: null, closes_at: null, is_closed: true }] })).toEqual([
      { start: '2030-07-14T15:00:00.000Z', end: '2030-07-14T17:00:00.000Z', durationMinutes: 120 },
      { start: '2030-07-16T07:00:00.000Z', end: '2030-07-16T11:00:00.000Z', durationMinutes: 240 },
    ])
  })

  it('case 7 — never combines partial availability from different bays', () => {
    const slots = generateAvailabilitySlots({
      ...baseAvailability, durationMinutes: 240, bays: ['bay-1', 'bay-2'],
      reservationSegments: [
        { work_bay_id: 'bay-1', segment_start: '2030-07-14T09:00:00.000Z', segment_end: '2030-07-14T17:00:00.000Z' },
        { work_bay_id: 'bay-2', segment_start: '2030-07-14T07:00:00.000Z', segment_end: '2030-07-14T09:00:00.000Z' },
      ],
    })
    expect(slots.some((slot) => slot.displayTime === '10:00')).toBe(false)
  })

  it('case 8 — rejects a bay when its next-day continuation conflicts', () => {
    const conflicts = [{ work_bay_id: 'bay-1', segment_start: '2030-07-15T09:00:00.000Z', segment_end: '2030-07-15T13:00:00.000Z' }]
    const bayOneOnly = generateAvailabilitySlots({ ...baseAvailability, durationMinutes: 360, bays: ['bay-1'], reservationSegments: conflicts })
    expect(bayOneOnly.some((slot) => slot.displayTime === '18:00')).toBe(false)
    const alternateBay = generateAvailabilitySlots({ ...baseAvailability, durationMinutes: 360, bays: ['bay-1', 'bay-2'], reservationSegments: conflicts })
    expect(alternateBay.find((slot) => slot.displayTime === '18:00')?.availableBayCount).toBe(1)
  })

  it('case 9 — a last-capacity winner removes the same candidate for the loser', () => {
    const firstTwo = ['bay-1', 'bay-2'].map((work_bay_id) => ({ work_bay_id, segment_start: '2030-07-14T09:00:00.000Z', segment_end: '2030-07-14T11:00:00.000Z' }))
    const beforeWinner = generateAvailabilitySlots({ ...baseAvailability, durationMinutes: 120, bays: ['bay-1', 'bay-2', 'bay-3'], reservationSegments: firstTwo })
    expect(beforeWinner.find((slot) => slot.displayTime === '12:00')?.availableBayCount).toBe(1)
    const afterWinner = generateAvailabilitySlots({ ...baseAvailability, durationMinutes: 120, bays: ['bay-1', 'bay-2', 'bay-3'], reservationSegments: [...firstTwo, { work_bay_id: 'bay-3', segment_start: '2030-07-14T09:00:00.000Z', segment_end: '2030-07-14T11:00:00.000Z' }] })
    expect(afterWinner.some((slot) => slot.displayTime === '12:00')).toBe(false)
  })

  it('case 10 — preserves 10:00–20:00 local hours across both Riga DST transitions', () => {
    const spring = calculateWorkSegments({ localDate: '2026-03-29', startMinute: 10 * 60, durationMinutes: 600, timezone: 'Europe/Riga', businessHours: hours, exceptions: [] })
    const autumn = calculateWorkSegments({ localDate: '2026-10-25', startMinute: 10 * 60, durationMinutes: 600, timezone: 'Europe/Riga', businessHours: hours, exceptions: [] })
    expect(spring).toEqual([{ start: '2026-03-29T07:00:00.000Z', end: '2026-03-29T17:00:00.000Z', durationMinutes: 600 }])
    expect(autumn).toEqual([{ start: '2026-10-25T08:00:00.000Z', end: '2026-10-25T18:00:00.000Z', durationMinutes: 600 }])
  })
})
