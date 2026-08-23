import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const migration = readFileSync(new URL('../../supabase/migrations/20260814084614_duration_based_scheduling.sql', import.meta.url), 'utf8')
const engine = readFileSync(new URL('../../supabase/migrations/20260814095137_scheduling_engine_completion.sql', import.meta.url), 'utf8')
const fixes = readFileSync(new URL('../../supabase/migrations/20260814101233_scheduling_engine_fixes.sql', import.meta.url), 'utf8')
const safety = readFileSync(new URL('../../supabase/migrations/20260814101413_scheduling_defaults_and_package_safety.sql', import.meta.url), 'utf8')
const transactionFix = readFileSync(new URL('../../supabase/migrations/20260814102055_fix_admin_transaction_ambiguity.sql', import.meta.url), 'utf8')
const repeatCustomerFix = readFileSync(new URL('../../supabase/migrations/20260821185826_fix_repeat_customer_booking.sql', import.meta.url), 'utf8')
const commercial = readFileSync(new URL('../../supabase/migrations/20260823103934_commercial_operations.sql', import.meta.url), 'utf8')
const notificationDelivery = readFileSync(new URL('../../supabase/migrations/20260823104540_notification_delivery.sql', import.meta.url), 'utf8')
const commercialTransactions = readFileSync(new URL('../../supabase/migrations/20260823105511_admin_commercial_transactions.sql', import.meta.url), 'utf8')
const privacyOperations = readFileSync(new URL('../../supabase/migrations/20260823111308_customer_privacy_operations.sql', import.meta.url), 'utf8')
const customerRecords = readFileSync(new URL('../../supabase/migrations/20260823114740_customer_records_and_legal_terms.sql', import.meta.url), 'utf8')
const hardening = readFileSync(new URL('../../supabase/migrations/20260823115138_security_and_index_hardening.sql', import.meta.url), 'utf8')

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

  it('stores condition ranges and immutable calculation snapshots in the booking transaction', () => {
    assert.match(commercial, /create table public\.reservation_conditions/i)
    assert.match(commercial, /create_scheduled_reservation_transactional_v3/i)
    assert.match(commercial, /indicator_snapshots jsonb/i)
    assert.match(commercialTransactions, /admin_save_duration_reservation_v4/i)
    assert.match(commercialTransactions, /commercial_overrides_updated/i)
  })

  it('keeps customer media private and verifies an uploaded object before finalization', () => {
    assert.match(commercial, /'reservation-media', 'reservation-media', false/i)
    assert.match(commercial, /revoke all on[\s\S]+public\.reservation_media[\s\S]+from anon, authenticated/i)
    assert.match(customerRecords, /from storage\.objects/i)
    assert.match(customerRecords, /uploaded object metadata mismatch/i)
    assert.match(customerRecords, /revoke all on function public\.finalize_reservation_media_upload/i)
  })

  it('selects service-specific checklist templates and audits deliberate completion', () => {
    assert.match(commercial, /service_checklist_templates/i)
    assert.match(commercial, /when s\.code = 'interior' then 'interior'/i)
    assert.match(commercial, /CHECKLIST_INCOMPLETE/i)
    assert.match(commercial, /checklist_item_updated/i)
  })

  it('documents the server-only RLS boundary and indexes operational foreign keys', () => {
    assert.match(hardening, /server functions only/i)
    assert.match(hardening, /for all to anon, authenticated using \(false\) with check \(false\)/i)
    assert.match(hardening, /reservation_media_uploaded_by_idx/i)
    assert.match(hardening, /service_checklist_templates_template_idx/i)
  })

  it('claims outbox rows without duplicate delivery and safely retries failures', () => {
    assert.match(commercial, /idempotency_key text not null unique/i)
    assert.match(notificationDelivery, /for update skip locked/i)
    assert.match(notificationDelivery, /attempt_count < 5/i)
  })

  it('requires deliberate customer merges and records correction and anonymisation', () => {
    assert.match(privacyOperations, /admin_merge_customers/i)
    assert.match(privacyOperations, /customer_merged/i)
    assert.match(privacyOperations, /active reservations prevent anonymisation/i)
    assert.match(customerRecords, /customer_vehicle_corrected/i)
  })
})
