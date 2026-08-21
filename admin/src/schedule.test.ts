import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildScheduleRows, localStart, scheduleStartTimes, START_TIMES } from './schedule.ts'
import type { ScheduleSegment, WorkBay } from './types.ts'

const bays: WorkBay[] = [
  { id: 'bay-1', code: 'bay_1', name: 'Bay 1', is_active: true, sort_order: 1 },
  { id: 'bay-2', code: 'bay_2', name: 'Bay 2', is_active: true, sort_order: 2 },
  { id: 'bay-3', code: 'bay_3', name: 'Bay 3', is_active: false, sort_order: 3 },
]

function segment(bayId: string, start: string, end: string): ScheduleSegment {
  return {
    id: 'segment-1', reservation_id: 'reservation-1', work_bay_id: bayId,
    segment_start: start, segment_end: end, duration_minutes: 120, occupies_capacity: true,
    reservation: { id: 'reservation-1', reference: 'VEL-2026-ABCDEFGH', status: 'confirmed', preferred_date: '2026-08-14', confirmed_date: '2026-08-14', work_bay_id: bayId, starts_at: start, ends_at: end, calculated_duration_minutes: 120, final_duration_minutes: null, estimated_total_cents: 4500, final_total_cents: null, customer_message: null, internal_notes: null, language: 'en', customer: { full_name: 'Client', phone: '+37120000000', email: null }, vehicle: { make_model: 'Car', vehicle_type: 'compact', vehicle_category_id: 'category' }, services: [], segments: [] },
  }
}

describe('duration schedule grid', () => {
  it('generates thirty-minute starts throughout 10:00–20:00', () => {
    assert.equal(START_TIMES.length, 20)
    assert.equal(START_TIMES[0], '10:00')
    assert.equal(START_TIMES.at(-1), '19:30')
  })

  it('tracks each work bay independently', () => {
    const rows = buildScheduleRows('2026-08-14', bays, [segment('bay-1', localStart('2026-08-14', '12:00'), localStart('2026-08-14', '14:00'))], [])
    const noon = rows.find((row) => row.start === '12:00')!
    assert.equal(noon.cells['bay-1'].status, 'reservation')
    assert.equal(noon.cells['bay-2'].status, 'available')
    assert.equal(noon.cells['bay-3'].status, 'inactive')
  })

  it('uses configurable opening and closing hours', () => {
    assert.deepEqual(scheduleStartTimes('09:00', '12:00'), ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'])
    const rows = buildScheduleRows('2026-08-14', bays, [], [], '11:00', '13:00')
    assert.equal(rows[0].start, '11:00')
    assert.equal(rows.at(-1)?.end, '13:00')
  })

  it('uses half-open ranges so an ending reservation releases its next start', () => {
    const rows = buildScheduleRows('2026-08-14', bays, [segment('bay-1', localStart('2026-08-14', '12:00'), localStart('2026-08-14', '14:00'))], [])
    assert.equal(rows.find((row) => row.start === '13:30')!.cells['bay-1'].status, 'reservation')
    assert.equal(rows.find((row) => row.start === '14:00')!.cells['bay-1'].status, 'available')
  })
})
