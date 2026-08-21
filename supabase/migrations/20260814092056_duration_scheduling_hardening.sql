-- Explicitly keep browser roles out of operational data while Netlify Functions
-- use the server-only service role. This also makes the RLS intent auditable.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'admin_profiles', 'api_rate_limits', 'blocked_periods', 'booking_history',
    'booking_items', 'booking_requests', 'business_hour_exceptions',
    'business_hours', 'customers', 'notification_logs', 'package_services',
    'reservation_history', 'reservation_segments', 'reservation_services',
    'reservation_slots', 'reservations', 'service_packages', 'services',
    'vehicle_categories', 'vehicles', 'work_bays'
  ] loop
    execute format('drop policy if exists server_only on public.%I', table_name);
    execute format(
      'create policy server_only on public.%I for all to anon, authenticated using (false) with check (false)',
      table_name
    );
  end loop;
end;
$$;

create schema if not exists extensions;
alter extension btree_gist set schema extensions;

create index if not exists blocked_periods_created_by_idx
  on public.blocked_periods (created_by);
create index if not exists booking_history_changed_by_idx
  on public.booking_history (changed_by);
create index if not exists booking_items_service_idx
  on public.booking_items (service_id);
create index if not exists booking_requests_customer_idx
  on public.booking_requests (customer_id);
create index if not exists booking_requests_vehicle_idx
  on public.booking_requests (vehicle_id);
create index if not exists notification_logs_booking_request_idx
  on public.notification_logs (booking_request_id);
create index if not exists package_services_service_idx
  on public.package_services (service_id);
create index if not exists reservations_work_bay_idx
  on public.reservations (work_bay_id);
create index if not exists vehicles_vehicle_category_idx
  on public.vehicles (vehicle_category_id);
