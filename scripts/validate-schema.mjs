import { readFileSync } from 'node:fs'

const schema = readFileSync('supabase/migrations/202608130001_booking_schema.sql', 'utf8').toLowerCase()
const legacyPrepare = readFileSync('supabase/migrations/202608130000_prepare_legacy_phase2.sql', 'utf8').toLowerCase()
const legacyCopy = readFileSync('supabase/migrations/202608130002_copy_legacy_phase2.sql', 'utf8').toLowerCase()
const bookingFunctions = readFileSync('supabase/migrations/202608130003_booking_functions.sql', 'utf8').toLowerCase()
const adminFunctions = readFileSync('supabase/migrations/202608130004_admin_functions.sql', 'utf8').toLowerCase()
const durationScheduling = readFileSync('supabase/migrations/20260814084614_duration_based_scheduling.sql', 'utf8').toLowerCase()
const durationHardening = readFileSync('supabase/migrations/20260814092056_duration_scheduling_hardening.sql', 'utf8').toLowerCase()
const schedulingEngine = readFileSync('supabase/migrations/20260814095137_scheduling_engine_completion.sql', 'utf8').toLowerCase()
const schedulingFixes = readFileSync('supabase/migrations/20260814101233_scheduling_engine_fixes.sql', 'utf8').toLowerCase()
const schedulingSafety = readFileSync('supabase/migrations/20260814101413_scheduling_defaults_and_package_safety.sql', 'utf8').toLowerCase()
const adminTransactionFix = readFileSync('supabase/migrations/20260814102055_fix_admin_transaction_ambiguity.sql', 'utf8').toLowerCase()
const repeatCustomerFix = readFileSync('supabase/migrations/20260821185228_fix_repeat_customer_booking.sql', 'utf8').toLowerCase()

const requiredTables = [
  'customers',
  'vehicles',
  'services',
  'booking_requests',
  'booking_items',
  'admin_profiles',
  'booking_history',
]

const requiredSchema = [
  ...requiredTables.map((table) => `create table public.${table}`),
  'booking_requests_no_overlapping_active',
  'exclude using gist',
  'estimated_price_cents integer',
  'calculated_price_cents_snapshot integer',
  'vehicle_multiplier_snapshot numeric',
  'enable row level security',
  'revoke all on all tables in schema public from anon, authenticated',
]
const requiredBookingFunctions = [
  'create function public.create_booking_transactional',
  'create function public.check_rate_limit',
  'security definer',
  'snapshot total mismatch',
  'grant execute on function public.create_booking_transactional',
]
const requiredAdminFunctions = [
  'create function public.admin_update_booking',
  'invalid status transition',
  'insert into public.booking_history',
  'grant execute on function public.admin_update_booking',
]
const requiredLegacyMigration = [
  'velora_legacy',
  'alter table public.%i set schema velora_legacy',
  'insert into public.booking_requests',
  'insert into public.booking_items',
  'insert into public.booking_history',
  'legacy booking migration row-count verification failed',
]
const requiredDurationScheduling = [
  "'bay_1'",
  "'bay_2'",
  "'bay_3'",
  'create table if not exists public.business_hour_exceptions',
  'create table if not exists public.reservation_segments',
  'tstzrange(segment_start, segment_end',
  "at time zone 'europe/riga'",
  'create_scheduled_reservation_transactional',
  'admin_save_duration_reservation_transactional',
  'scheduling_conflict',
]
const requiredDurationHardening = [
  'create policy server_only',
  'alter extension btree_gist set schema extensions',
  'reservations_work_bay_idx',
]
const requiredSchedulingEngine = [
  'create schema if not exists private',
  'create or replace function private.find_nearest_plan',
  'create or replace function public.scheduling_availability',
  'create or replace function public.admin_scheduling_preview',
  'pending_expires_at',
  'buffer_minutes_snapshot',
  "source in ('public_website', 'admin', 'phone', 'walk_in', 'legacy')",
]
const requiredSchedulingFixes = [
  'pending_reservation_expired',
  'create_scheduled_reservation_transactional_v2',
  'package_duration_minutes_snapshot',
  'admin_save_duration_reservation_v3',
]
const requiredSchedulingSafety = [
  "alter column source set default 'public_website'",
  'coalesce(final_duration_minutes, calculated_duration_minutes)',
  'capacity_released_at is null',
]
const requiredAdminTransactionFix = [
  'delete from public.reservation_segments old_segments',
  'update public.reservation_segments old_segments',
  'reservation_completed_capacity_retained',
]
const requiredRepeatCustomerFix = [
  'on conflict (normalized_email, normalized_phone)',
  'returning id into v_customer_id',
  'security invoker',
]

const missing = [
  ...requiredSchema.filter((value) => !schema.includes(value)),
  ...requiredBookingFunctions.filter((value) => !bookingFunctions.includes(value)),
  ...requiredAdminFunctions.filter((value) => !adminFunctions.includes(value)),
  ...requiredLegacyMigration.filter((value) => !legacyPrepare.includes(value) && !legacyCopy.includes(value)),
  ...requiredDurationScheduling.filter((value) => !durationScheduling.includes(value)),
  ...requiredDurationHardening.filter((value) => !durationHardening.includes(value)),
  ...requiredSchedulingEngine.filter((value) => !schedulingEngine.includes(value)),
  ...requiredSchedulingFixes.filter((value) => !schedulingFixes.includes(value)),
  ...requiredSchedulingSafety.filter((value) => !schedulingSafety.includes(value)),
  ...requiredAdminTransactionFix.filter((value) => !adminTransactionFix.includes(value)),
  ...requiredRepeatCustomerFix.filter((value) => !repeatCustomerFix.includes(value)),
]

if (missing.length) {
  process.stderr.write(`Schema validation failed: ${missing.join(', ')}\n`)
  process.exit(1)
}

process.stdout.write('Schema validation passed.\n')
