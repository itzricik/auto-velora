begin;
select plan(11);

select has_table('public', 'customers', 'customers table exists');
select has_table('public', 'vehicles', 'vehicles table exists');
select has_table('public', 'services', 'services table exists');
select has_table('public', 'booking_requests', 'booking_requests table exists');
select has_table('public', 'booking_items', 'booking_items table exists');
select has_table('public', 'admin_profiles', 'admin_profiles table exists');
select has_table('public', 'booking_history', 'booking_history table exists');
select col_is_unique('public', 'booking_requests', 'reference', 'booking reference is unique');
select col_is_unique('public', 'booking_requests', 'idempotency_key', 'idempotency key is unique');
select policies_are('public', 'booking_requests', array[]::text[], 'booking requests use deny-by-default RLS');
select hasnt_table_privilege('anon', 'public', 'booking_requests', 'select', 'anonymous users cannot read booking requests');

select * from finish();
rollback;
