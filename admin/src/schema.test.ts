import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const migration = readFileSync(new URL('../../supabase/migrations/202608140001_admin_schedule.sql', import.meta.url), 'utf8')
const noShowEnumMigration = readFileSync(new URL('../../supabase/migrations/202608140003_reservation_no_show.sql', import.meta.url), 'utf8')
const noShowFunctionMigration = readFileSync(new URL('../../supabase/migrations/202608140004_reservation_no_show_function.sql', import.meta.url), 'utf8')

describe('database scheduling guarantees', () => {
  it('constrains rows to all six fixed interval pairs', () => {
    for (const pair of ['10:00.*12:00', '12:00.*14:00', '14:00.*16:00', '16:00.*18:00', '18:00.*20:00', '20:00.*22:00']) {
      assert.match(migration, new RegExp(pair, 's'))
    }
  })

  it('enforces one active occupant per date and start time', () => {
    assert.match(migration, /unique index[^;]+\(slot_date, start_time\)[^;]+where status in \('pending', 'confirmed', 'in_progress', 'completed', 'blocked'\)/is)
  })

  it('releases slots on cancellation and excludes cancelled slots from uniqueness', () => {
    assert.match(migration, /set status = 'cancelled'[^;]+where reservation_id/is)
    const uniqueClause = migration.match(/create unique index if not exists reservation_slots_active_unique[\s\S]+?;/)?.[0]
    assert.ok(!uniqueClause?.includes("'cancelled'"))
  })

  it('creates multi-slot reservations and blocks inside database functions', () => {
    assert.ok(migration.includes('admin_save_reservation_transactional'))
    assert.ok(migration.includes('admin_block_slots_transactional'))
    assert.match(migration, /for v_slot_index in v_start_index\.\./)
  })

  it('supports no-show reservations without inventing a slot status', () => {
    assert.match(noShowEnumMigration, /add value if not exists 'no_show'/)
    assert.match(noShowFunctionMigration, /set status = 'no_show'/)
    assert.match(noShowFunctionMigration, /p_status = 'no_show'/)
    assert.doesNotMatch(noShowEnumMigration, /reservation_slot_status/)
  })
})
