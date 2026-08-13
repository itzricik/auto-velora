begin;

do $$
declare
  relation_name text;
  function_signature regprocedure;
begin
  if to_regclass('public.bookings') is null
    or to_regclass('public.booking_requests') is not null then
    return;
  end if;

  create schema if not exists velora_legacy;
  revoke all on schema velora_legacy from public, anon, authenticated;

  foreach relation_name in array array[
    'vehicle_categories',
    'services',
    'service_packages',
    'package_services',
    'work_bays',
    'business_hours',
    'admin_profiles',
    'blocked_periods',
    'customers',
    'bookings',
    'booking_services',
    'booking_status_history',
    'notification_logs',
    'api_rate_limits'
  ]
  loop
    if to_regclass(format('public.%I', relation_name)) is not null then
      execute format('alter table public.%I set schema velora_legacy', relation_name);
    end if;
  end loop;

  for function_signature in
    select procedure.oid::regprocedure
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'set_updated_at',
        'check_rate_limit',
        'create_booking_transactional',
        'cancel_public_booking',
        'admin_update_booking'
      )
  loop
    execute format('drop function %s cascade', function_signature);
  end loop;

  if to_regtype('public.booking_status') is not null then
    alter type public.booking_status set schema velora_legacy;
  end if;
  if to_regtype('public.notification_status') is not null then
    alter type public.notification_status set schema velora_legacy;
  end if;
end;
$$;

commit;
