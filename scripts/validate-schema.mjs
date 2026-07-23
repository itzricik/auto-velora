import { readFileSync } from 'node:fs'

const schema = readFileSync('supabase/migrations/202607230001_phase2_schema.sql', 'utf8')
const rpcs = readFileSync('supabase/migrations/202607230002_booking_rpcs.sql', 'utf8')
const requiredSchema = [
  'create table public.bookings',
  'bookings_no_overlapping_active',
  'exclude using gist',
  'enable row level security',
  'public_access_token_hash',
  'idempotency_key uuid not null unique',
]
const requiredRpcs = [
  'create function public.create_booking_transactional',
  'create function public.cancel_public_booking',
  'create function public.check_rate_limit',
  'security definer',
]

const missing = [
  ...requiredSchema.filter((value) => !schema.toLowerCase().includes(value)),
  ...requiredRpcs.filter((value) => !rpcs.toLowerCase().includes(value)),
]

if (missing.length) {
  process.stderr.write(`Schema validation failed: ${missing.join(', ')}\n`)
  process.exit(1)
}

process.stdout.write('Schema validation passed.\n')
