#!/usr/bin/env bash
set -euo pipefail

database_url="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

psql "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
insert into public.customers (id, full_name, normalized_email, normalized_phone)
values ('50000000-0000-4000-8000-000000000099', 'Concurrency Test Customer', 'concurrency@example.test', '+37120000099')
on conflict (id) do nothing;

insert into public.vehicles (id, customer_id, make_model, vehicle_category_id)
values ('51000000-0000-4000-8000-000000000099', '50000000-0000-4000-8000-000000000099', 'Concurrency Test Vehicle', '10000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
SQL

insert_booking() {
  local booking_id="$1"
  local reference="$2"
  local token_character="$3"
  local idempotency_key="$4"
  psql "$database_url" -v ON_ERROR_STOP=1 -v booking_id="$booking_id" -v reference="$reference" -v token_character="$token_character" -v idempotency_key="$idempotency_key" <<'SQL'
insert into public.booking_requests (
  id, reference, public_access_token_hash, customer_id, vehicle_id, work_bay_id,
  starts_at, ends_at, preferred_date, status, vehicle_make_model_snapshot,
  vehicle_type_code_snapshot, vehicle_type_name_snapshot, vehicle_multiplier_snapshot,
  base_price_cents_snapshot, estimated_price_cents, estimated_duration_minutes,
  pricing_version, booking_language, consent_timestamp, consent_policy_version, idempotency_key
) values (
  :'booking_id', :'reference', repeat(:'token_character', 64),
  '50000000-0000-4000-8000-000000000099', '51000000-0000-4000-8000-000000000099',
  '40000000-0000-4000-8000-000000000001', '2031-01-02T08:00:00Z', '2031-01-02T10:00:00Z', '2031-01-02',
  'confirmed', 'Concurrency Test Vehicle', 'compact', 'Compact', 1.00,
  10000, 10000, 120, 'test', 'en', now(), 'test', :'idempotency_key'
);
SQL
}

(insert_booking '60000000-0000-4000-8000-000000000099' 'VEL-2031-RACE0001' 'a' '70000000-0000-4000-8000-000000000099') &
first_pid=$!
sleep 0.25
set +e
conflict_output="$(insert_booking '60000000-0000-4000-8000-000000000100' 'VEL-2031-RACE0002' 'b' '70000000-0000-4000-8000-000000000100' 2>&1)"
conflict_status=$?
set -e
wait "$first_pid"

if [[ "$conflict_status" -eq 0 ]] || [[ "$conflict_output" != *"booking_requests_no_overlapping_active"* ]]; then
  echo "Concurrent overlap test failed." >&2
  exit 1
fi

echo "Concurrent overlap test passed."
