#!/usr/bin/env bash
set -euo pipefail

database_url="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

psql "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
insert into public.customers (
  id, full_name, normalized_email, normalized_phone
) values (
  '50000000-0000-4000-8000-000000000099',
  'Concurrency Test Customer',
  'concurrency@example.test',
  '+37120000099'
) on conflict (id) do nothing;
SQL

insert_booking() {
  local booking_id="$1"
  local reference="$2"
  local token_character="$3"
  local idempotency_key="$4"
  psql "$database_url" -v ON_ERROR_STOP=1 \
    -v booking_id="$booking_id" \
    -v reference="$reference" \
    -v token_character="$token_character" \
    -v idempotency_key="$idempotency_key" <<'SQL'
insert into public.bookings (
  id, reference, public_access_token_hash, customer_id, work_bay_id,
  vehicle_category_id, vehicle_description, starts_at, ends_at, status,
  estimated_price_cents, estimated_duration_minutes, pricing_version,
  booking_language, consent_timestamp, consent_policy_version, idempotency_key
) values (
  :'booking_id', :'reference', repeat(:'token_character', 64),
  '50000000-0000-4000-8000-000000000099',
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Concurrency test vehicle',
  '2031-01-02T08:00:00Z',
  '2031-01-02T10:00:00Z',
  'confirmed',
  10000,
  120,
  'test',
  'en',
  now(),
  'test',
  :'idempotency_key'
);
SQL
}

(
  psql "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
begin;
select pg_advisory_xact_lock(20310102);
insert into public.bookings (
  id, reference, public_access_token_hash, customer_id, work_bay_id,
  vehicle_category_id, vehicle_description, starts_at, ends_at, status,
  estimated_price_cents, estimated_duration_minutes, pricing_version,
  booking_language, consent_timestamp, consent_policy_version, idempotency_key
) values (
  '60000000-0000-4000-8000-000000000099',
  'VEL-2031-RACE0001',
  repeat('a', 64),
  '50000000-0000-4000-8000-000000000099',
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Concurrency test vehicle A',
  '2031-01-02T08:00:00Z',
  '2031-01-02T10:00:00Z',
  'confirmed',
  10000,
  120,
  'test',
  'en',
  now(),
  'test',
  '70000000-0000-4000-8000-000000000099'
);
select pg_sleep(2);
commit;
SQL
) &
first_pid=$!

sleep 0.25
set +e
conflict_output="$(
  insert_booking \
    '60000000-0000-4000-8000-000000000100' \
    'VEL-2031-RACE0002' \
    'b' \
    '70000000-0000-4000-8000-000000000100' 2>&1
)"
conflict_status=$?
set -e
wait "$first_pid"

if [[ "$conflict_status" -eq 0 ]]; then
  echo "Concurrent overlap test failed: both inserts succeeded." >&2
  exit 1
fi

if [[ "$conflict_output" != *"bookings_no_overlapping_active"* ]]; then
  echo "Concurrent overlap test failed with an unexpected database error." >&2
  exit 1
fi

echo "Concurrent overlap test passed."
