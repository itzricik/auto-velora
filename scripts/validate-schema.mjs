import { readFileSync } from 'node:fs'

const schema = readFileSync('supabase/migrations/202608130001_booking_schema.sql', 'utf8').toLowerCase()
const legacyPrepare = readFileSync('supabase/migrations/202608130000_prepare_legacy_phase2.sql', 'utf8').toLowerCase()
const legacyCopy = readFileSync('supabase/migrations/202608130002_copy_legacy_phase2.sql', 'utf8').toLowerCase()
const bookingFunctions = readFileSync('supabase/migrations/202608130003_booking_functions.sql', 'utf8').toLowerCase()
const adminFunctions = readFileSync('supabase/migrations/202608130004_admin_functions.sql', 'utf8').toLowerCase()

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

const missing = [
  ...requiredSchema.filter((value) => !schema.includes(value)),
  ...requiredBookingFunctions.filter((value) => !bookingFunctions.includes(value)),
  ...requiredAdminFunctions.filter((value) => !adminFunctions.includes(value)),
  ...requiredLegacyMigration.filter((value) => !legacyPrepare.includes(value) && !legacyCopy.includes(value)),
]

if (missing.length) {
  process.stderr.write(`Schema validation failed: ${missing.join(', ')}\n`)
  process.exit(1)
}

process.stdout.write('Schema validation passed.\n')
