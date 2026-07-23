begin;
select plan(9);

select has_table('public', 'bookings', 'bookings table exists');
select col_is_unique('public', 'bookings', 'reference', 'booking reference is unique');
select col_is_unique('public', 'bookings', 'idempotency_key', 'idempotency key is unique');
select policies_are('public', 'bookings', array[]::text[], 'bookings use deny-by-default RLS');
select hasnt_table_privilege('anon', 'public', 'bookings', 'select', 'anonymous users cannot read bookings');
select has_table_privilege('service_role', 'public', 'bookings', 'insert', 'service role can create bookings');

insert into public.customers (
  id, full_name, normalized_email, normalized_phone
) values (
  '50000000-0000-4000-8000-000000000001',
  'Database Test Customer',
  'database-test@example.test',
  '+37120000001'
);

insert into public.bookings (
  id, reference, public_access_token_hash, customer_id, work_bay_id,
  vehicle_category_id, vehicle_description, starts_at, ends_at, status,
  estimated_price_cents, estimated_duration_minutes, pricing_version,
  booking_language, consent_timestamp, consent_policy_version, idempotency_key
) values (
  '60000000-0000-4000-8000-000000000001',
  'VEL-2030-DBTEST01',
  repeat('a', 64),
  '50000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Constraint test vehicle',
  '2030-01-02T08:00:00Z',
  '2030-01-02T10:00:00Z',
  'confirmed',
  10000,
  120,
  'test',
  'en',
  now(),
  'test',
  '70000000-0000-4000-8000-000000000001'
);

select throws_ok(
  $$insert into public.bookings (
    reference, public_access_token_hash, customer_id, work_bay_id,
    vehicle_category_id, vehicle_description, starts_at, ends_at, status,
    estimated_price_cents, estimated_duration_minutes, pricing_version,
    booking_language, consent_timestamp, consent_policy_version, idempotency_key
  ) values (
    'VEL-2030-DBTEST02', repeat('b', 64),
    '50000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Overlapping vehicle', '2030-01-02T09:00:00Z', '2030-01-02T11:00:00Z',
    'confirmed', 10000, 120, 'test', 'en', now(), 'test',
    '70000000-0000-4000-8000-000000000002'
  )$$,
  '23P01',
  null,
  'overlapping confirmed bookings are rejected'
);

select lives_ok(
  $$insert into public.bookings (
    reference, public_access_token_hash, customer_id, work_bay_id,
    vehicle_category_id, vehicle_description, starts_at, ends_at, status,
    estimated_price_cents, estimated_duration_minutes, pricing_version,
    booking_language, consent_timestamp, consent_policy_version, idempotency_key
  ) values (
    'VEL-2030-DBTEST03', repeat('c', 64),
    '50000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Cancelled vehicle', '2030-01-02T09:00:00Z', '2030-01-02T11:00:00Z',
    'cancelled', 10000, 120, 'test', 'en', now(), 'test',
    '70000000-0000-4000-8000-000000000003'
  )$$,
  'cancelled bookings do not block the bay'
);

select throws_ok(
  $$insert into public.bookings (
    reference, public_access_token_hash, customer_id, work_bay_id,
    vehicle_category_id, vehicle_description, starts_at, ends_at, status,
    estimated_price_cents, estimated_duration_minutes, pricing_version,
    booking_language, consent_timestamp, consent_policy_version, idempotency_key
  ) values (
    'VEL-2030-DBTEST04', repeat('d', 64),
    '50000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Duplicate request', '2030-01-03T08:00:00Z', '2030-01-03T10:00:00Z',
    'requested', 10000, 120, 'test', 'en', now(), 'test',
    '70000000-0000-4000-8000-000000000001'
  )$$,
  '23505',
  null,
  'idempotency keys cannot be reused for another booking'
);

select * from finish();
rollback;
