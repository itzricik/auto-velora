-- Optional non-production data for local or staging verification.
-- Run only after the migrations and seed file. All identities are fictional.
begin;

with customer as (
  insert into public.customers (full_name, normalized_email, normalized_phone)
  values ('VELORA Test Customer', 'booking-test@example.test', '+37120000001')
  on conflict (normalized_email, normalized_phone)
  do update set full_name = excluded.full_name
  returning id
), vehicle as (
  insert into public.vehicles (customer_id, make_model, vehicle_category_id)
  select customer.id, 'Test Sedan', '10000000-0000-4000-8000-000000000002'
  from customer
  returning id, customer_id
), booking as (
  insert into public.booking_requests (
    reference, public_access_token_hash, customer_id, vehicle_id, work_bay_id,
    starts_at, ends_at, preferred_date, status,
    vehicle_make_model_snapshot, vehicle_type_code_snapshot,
    vehicle_type_name_snapshot, vehicle_multiplier_snapshot,
    base_price_cents_snapshot, estimated_price_cents,
    estimated_duration_minutes, pricing_version, booking_language,
    customer_notes, consent_timestamp, consent_policy_version, idempotency_key
  )
  select
    'VEL-2030-TEST0001', repeat('a', 64), vehicle.customer_id, vehicle.id,
    '40000000-0000-4000-8000-000000000001',
    '2030-01-15T09:00:00+02:00', '2030-01-15T11:30:00+02:00', '2030-01-15', 'new',
    'Test Sedan', 'sedan', 'Sedan', 1.10,
    4500, 4950, 150, 'test-data-v1', 'en',
    'Staging verification request.', now(), 'test-only',
    '70000000-0000-4000-8000-000000000001'
  from vehicle
  on conflict (reference) do update set customer_notes = excluded.customer_notes
  returning id
)
insert into public.booking_items (
  booking_request_id, service_id, service_code_snapshot, service_name_snapshot,
  base_price_cents_snapshot, vehicle_multiplier_snapshot,
  calculated_price_cents_snapshot, duration_minutes_snapshot
)
select booking.id, '20000000-0000-4000-8000-000000000001',
  'exterior', 'Signature Exterior', 4500, 1.10, 4950, 120
from booking
on conflict (booking_request_id, service_id) do nothing;

commit;
