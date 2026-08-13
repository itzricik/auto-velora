import { describe, expect, it } from 'vitest'
import { generateAvailabilitySlots, zonedLocalToUtc } from './availability'

describe('availability slot generation', () => {
  it('converts Riga local time to UTC and handles daylight-saving gaps', () => {
    expect(zonedLocalToUtc('2030-01-02', '09:00', 'Europe/Riga')?.toISOString()).toBe('2030-01-02T07:00:00.000Z')
    expect(zonedLocalToUtc('2026-03-29', '03:30', 'Europe/Riga')).toBeNull()
  })

  it('removes blocked and confirmed intervals and reports bay capacity', () => {
    const slots = generateAvailabilitySlots({
      localDate: '2030-01-02',
      timezone: 'Europe/Riga',
      durationMinutes: 60,
      bufferMinutes: 30,
      slotIntervalMinutes: 30,
      minNoticeHours: 0,
      maxDaysAhead: 90,
      bays: ['bay-1', 'bay-2'],
      businessHours: [{ weekday: 3, opens_at: '09:00', closes_at: '12:00', is_closed: false }],
      blockedPeriods: [{
        work_bay_id: 'bay-1',
        starts_at: '2030-01-02T07:00:00.000Z',
        ends_at: '2030-01-02T09:00:00.000Z',
      }],
      bookings: [{
        work_bay_id: 'bay-2',
        starts_at: '2030-01-02T07:30:00.000Z',
        ends_at: '2030-01-02T08:30:00.000Z',
      }],
      now: new Date('2029-12-01T00:00:00.000Z'),
    })

    expect(slots).toHaveLength(1)
    expect(slots[0]).toMatchObject({ displayTime: '10:30', availableBayCount: 1 })
    expect(slots.some((slot) => slot.displayTime === '09:00')).toBe(false)
    expect(slots.some((slot) => slot.displayTime === '09:30')).toBe(false)
    expect(slots.at(-1)?.displayTime).toBe('10:30')
  })

  it('does not offer dates outside the booking window', () => {
    const slots = generateAvailabilitySlots({
      localDate: '2030-06-01',
      timezone: 'Europe/Riga',
      durationMinutes: 60,
      bufferMinutes: 0,
      slotIntervalMinutes: 30,
      minNoticeHours: 0,
      maxDaysAhead: 30,
      bays: ['bay-1'],
      businessHours: [{ weekday: 6, opens_at: '09:00', closes_at: '12:00', is_closed: false }],
      blockedPeriods: [],
      bookings: [],
      now: new Date('2030-01-01T00:00:00.000Z'),
    })
    expect(slots).toEqual([])
  })
})
