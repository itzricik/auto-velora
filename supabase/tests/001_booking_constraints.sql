begin;
select plan(5);

select has_table('public', 'bookings', 'bookings table exists');
select col_is_unique('public', 'bookings', 'reference', 'booking reference is unique');
select col_is_unique('public', 'bookings', 'idempotency_key', 'idempotency key is unique');
select policies_are('public', 'bookings', array[]::text[], 'bookings have no client-access policies');
select throws_ok(
  $$insert into public.bookings (
    reference, public_access_token_hash, customer_id, work_bay_id, vehicle_category_id,
    vehicle_description, starts_at, ends_at, status, estimated_price_cents,
    estimated_duration_minutes, pricing_version, consent_timestamp,
    consent_policy_version, idempotency_key
  ) select
    'VEL-2026-OVERLAP1', repeat('a', 64), b.customer_id, b.work_bay_id,
    b.vehicle_category_id, 'Constraint test', b.starts_at + interval '30 minutes',
    b.ends_at, 'confirmed', 10000, 60, 'test', now(), 'test', gen_random_uuid()
  from public.bookings b where b.status = 'confirmed' limit 1$$,
  '23P01',
  null,
  'overlapping active bookings are rejected'
);

select * from finish();
rollback;
