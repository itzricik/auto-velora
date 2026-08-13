import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildScheduleRows, canOccupy, consecutiveIntervals, SLOT_INTERVALS } from './schedule.ts'
import type { OccupiedSlot } from './types.ts'

function occupied(start: string, reservationId = 'reservation-1'): OccupiedSlot {
  const interval = SLOT_INTERVALS.find((slot) => slot.start === start)!
  return {
    id: `slot-${start}`,
    reservation_id: reservationId,
    slot_date: '2026-08-14',
    start_time: `${interval.start}:00`,
    end_time: `${interval.end}:00`,
    status: 'confirmed',
    block_reason: null,
    reservation: null,
  }
}

describe('fixed schedule', () => {
  it('always generates the exact six required intervals', () => {
    assert.deepEqual(buildScheduleRows([]).map(({ start, end }) => `${start}â€“${end}`), [
      '10:00â€“12:00', '12:00â€“14:00', '14:00â€“16:00',
      '16:00â€“18:00', '18:00â€“20:00', '20:00â€“22:00',
    ])
  })

  it('builds a multi-slot reservation from consecutive intervals only', () => {
    assert.deepEqual(consecutiveIntervals('12:00', 3), [
      { start: '12:00', end: '14:00' },
      { start: '14:00', end: '16:00' },
      { start: '16:00', end: '18:00' },
    ])
    assert.deepEqual(consecutiveIntervals('20:00', 2), [])
  })

  it('rejects a range when any required interval conflicts', () => {
    const rows = buildScheduleRows([occupied('14:00')])
    assert.equal(canOccupy(rows, '12:00', 3), false)
    assert.equal(canOccupy(rows, '16:00', 2), true)
  })

  it('allows an existing reservation to keep its own intervals while editing', () => {
    const rows = buildScheduleRows([occupied('12:00'), occupied('14:00')])
    assert.equal(canOccupy(rows, '12:00', 2, 'reservation-1'), true)
    assert.equal(canOccupy(rows, '12:00', 2, 'reservation-2'), false)
  })

  it('shows cancelled reservation intervals as available once released by the API', () => {
    const activeApiResult: OccupiedSlot[] = []
    assert.equal(buildScheduleRows(activeApiResult)[0].status, 'available')
  })
})
