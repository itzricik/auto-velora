import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const migration = readFileSync(new URL('../../supabase/migrations/20260814084614_duration_based_scheduling.sql', import.meta.url), 'utf8')
const engine = readFileSync(new URL('../../supabase/migrations/20260814095137_scheduling_engine_completion.sql', import.meta.url), 'utf8')
const fixes = readFileSync(new URL('../../supabase/migrations/20260814101233_scheduling_engine_fixes.sql', import.meta.url), 'utf8')
const safety = readFileSync(new URL('../../supabase/migrations/20260814101413_scheduling_defaults_and_package_safety.sql', import.meta.url), 'utf8')
const transactionFix = readFileSync(new URL('../../supabase/migrations/20260814102055_fix_admin_transaction_ambiguity.sql', import.meta.url), 'utf8')
const repeatCustomerFix = readFileSync(new URL('../../supabase/migrations/20260821185228_fix_repeat_customer_booking.sql', import.meta.url), 'utf8')

describe('duration scheduling database guarantees', () => {
  it('creates three independent work bays and configurable calendar exceptions', () => {
    for (const bay of ['bay_1', 'bay_2', 'bay_3']) assert.match(migration, new RegExp(`'${bay}'`))
    assert.match(migration, /create table if not exists public\.business_hour_exceptions/i)
  })

  it('stores timezone-aware daily segments and prevents same-bay overlaps', () => {
    assert.match(migration, /segment_start timestamptz not null/i)
    assert.match(migration, /exclude using gist[\s\S]+work_bay_id with =[\s\S]+tstzrange\(segment_start, segment_end, '\[\)'\) with &&/i)
  })

  it('calculates multi-day work using Riga hours and skips closed days', () => {
    assert.match(migration, /velora_calculate_segments/i)
    assert.match(migration, /at time zone 'Europe\/Riga'/i)
    assert.match(migration, /coalesce\(v_closed, true\)/i)
  })

  it('creates reservations and segments in one transaction and safely maps conflicts', () => {
    assert.match(migration, /create_scheduled_reservation_transactional/i)
    assert.match(migration, /exception when exclusion_violation/i)
    assert.match(migration, /SCHEDULING_CONFLICT/i)
  })

  it('releases future capacity without deleting history', () => {
    assert.match(migration, /set occupies_capacity = false/i)
    assert.match(migration, /insert into public\.reservation_history/i)
  })

  it('centralizes public and admin planning in a private shared engine', () => {
    assert.match(engine, /function private\.find_nearest_plan/i)
    assert.match(engine, /function public\.scheduling_availability/i)
    assert.match(engine, /function public\.admin_scheduling_preview/i)
    assert.match(engine, /revoke all on all functions in schema private/i)
  })

  it('preserves package snapshots and records automatic pending expiry', () => {
    assert.match(fixes, /package_duration_minutes_snapshot/i)
    assert.match(fixes, /pending_reservation_expired/i)
    assert.match(fixes, /create_scheduled_reservation_transactional_v2/i)
  })

  it('validates final duration while retaining completed capacity until explicit release', () => {
    assert.match(safety, /coalesce\(final_duration_minutes, calculated_duration_minutes\)/i)
    assert.match(safety, /capacity_released_at is null/i)
  })

  it('updates reservations transactionally without ambiguous output-column references', () => {
    assert.match(transactionFix, /delete from public\.reservation_segments old_segments/i)
    assert.match(transactionFix, /update public\.reservation_segments old_segments/i)
  })

  it('atomically reuses a returning customer during scheduled reservation creation', () => {
    assert.match(repeatCustomerFix, /on conflict \(normalized_email, normalized_phone\)/i)
    assert.match(repeatCustomerFix, /returning id into v_customer_id/i)
    assert.match(repeatCustomerFix, /security invoker/i)
    assert.doesNotMatch(repeatCustomerFix, /security definer/i)
  })
})
