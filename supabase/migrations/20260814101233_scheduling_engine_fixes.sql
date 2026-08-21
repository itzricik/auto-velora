create or replace function private.expire_pending_reservations()
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_reservation public.reservations%rowtype;
  v_count integer := 0;
begin
  for v_reservation in
    select *
    from public.reservations
    where status = 'pending'
      and pending_expires_at is not null
      and pending_expires_at <= now()
    for update skip locked
  loop
    update public.reservations
    set status = 'expired', updated_at = now()
    where id = v_reservation.id;

    insert into public.reservation_history (
      reservation_id, changed_by, action, old_value, new_value
    ) values (
      v_reservation.id,
      null,
      'pending_reservation_expired',
      to_jsonb(v_reservation),
      to_jsonb(v_reservation) || jsonb_build_object('status', 'expired', 'updated_at', now())
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.admin_save_duration_reservation_v3(
  p_actor uuid,
  p_reservation_id uuid,
  p_reference text,
  p_full_name text,
  p_phone text,
  p_email text,
  p_vehicle_category_id uuid,
  p_vehicle_description text,
  p_preferred_date date,
  p_requested_start timestamptz,
  p_work_bay_id uuid,
  p_status public.reservation_status,
  p_estimated_total_cents integer,
  p_final_total_cents integer,
  p_calculated_duration_minutes integer,
  p_final_duration_minutes integer,
  p_customer_message text,
  p_internal_notes text,
  p_language text,
  p_source text,
  p_vehicle_snapshot jsonb,
  p_service_snapshots jsonb
)
returns table (reservation_id uuid, reference text, status public.reservation_status)
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_result record;
begin
  if p_source not in ('public_website', 'admin', 'phone', 'walk_in') then
    raise exception 'invalid reservation source' using errcode = '22023';
  end if;

  select * into v_result
  from public.admin_save_duration_reservation_v2(
    p_actor, p_reservation_id, p_reference, p_full_name, p_phone, p_email,
    p_vehicle_category_id, p_vehicle_description, p_preferred_date,
    p_requested_start, p_work_bay_id, p_status, p_estimated_total_cents,
    p_final_total_cents, p_calculated_duration_minutes, p_final_duration_minutes,
    p_customer_message, p_internal_notes, p_language,
    case when p_source = 'public_website' then 'admin' else p_source end,
    p_vehicle_snapshot, p_service_snapshots
  );

  if p_source = 'public_website' then
    update public.reservations set source = p_source where id = v_result.reservation_id;
  end if;

  return query select v_result.reservation_id, v_result.reference, v_result.status;
end;
$$;

revoke all on function public.admin_save_duration_reservation_v3(
  uuid, uuid, text, text, text, text, uuid, text, date, timestamptz, uuid,
  public.reservation_status, integer, integer, integer, integer, text, text,
  text, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.admin_save_duration_reservation_v3(
  uuid, uuid, text, text, text, text, uuid, text, date, timestamptz, uuid,
  public.reservation_status, integer, integer, integer, integer, text, text,
  text, text, jsonb, jsonb
) to service_role;

alter table public.reservations
  add column if not exists package_id uuid references public.service_packages(id) on delete restrict,
  add column if not exists package_code_snapshot text,
  add column if not exists package_name_snapshot text,
  add column if not exists package_price_cents_snapshot integer,
  add column if not exists package_duration_minutes_snapshot integer,
  add column if not exists package_buffer_minutes_snapshot integer;

alter table public.reservations
  drop constraint if exists reservations_package_snapshot_shape,
  add constraint reservations_package_snapshot_shape check (
    (
      package_id is null
      and package_code_snapshot is null
      and package_name_snapshot is null
      and package_price_cents_snapshot is null
      and package_duration_minutes_snapshot is null
      and package_buffer_minutes_snapshot is null
    ) or (
      package_id is not null
      and nullif(package_code_snapshot, '') is not null
      and nullif(package_name_snapshot, '') is not null
      and package_price_cents_snapshot >= 0
      and package_duration_minutes_snapshot > 0
      and package_buffer_minutes_snapshot >= 0
    )
  );
create index if not exists reservations_package_id_idx on public.reservations (package_id)
  where package_id is not null;

create or replace function public.create_scheduled_reservation_transactional_v2(
  p_reference text,
  p_full_name text,
  p_phone text,
  p_email text,
  p_vehicle_category_id uuid,
  p_vehicle_description text,
  p_requested_start timestamptz,
  p_estimated_total_cents integer,
  p_calculated_duration_minutes integer,
  p_language text,
  p_customer_message text,
  p_idempotency_key uuid,
  p_vehicle_snapshot jsonb,
  p_service_snapshots jsonb,
  p_package_snapshot jsonb default null
)
returns table (
  reservation_id uuid,
  reference text,
  status public.reservation_status,
  starts_at timestamptz,
  ends_at timestamptz,
  work_bay_id uuid,
  estimated_total_cents integer,
  calculated_duration_minutes integer,
  was_existing boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_result record;
begin
  if p_package_snapshot is not null and (
    jsonb_typeof(p_package_snapshot) <> 'object'
    or nullif(p_package_snapshot->>'package_id', '') is null
    or nullif(p_package_snapshot->>'package_code', '') is null
    or nullif(p_package_snapshot->>'package_name', '') is null
    or (p_package_snapshot->>'package_price_cents')::integer < 0
    or (p_package_snapshot->>'duration_minutes')::integer <= 0
    or coalesce((p_package_snapshot->>'buffer_minutes')::integer, 0) < 0
  ) then
    raise exception 'invalid package snapshot' using errcode = '22023';
  end if;

  select * into v_result
  from public.create_scheduled_reservation_transactional(
    p_reference, p_full_name, p_phone, p_email, p_vehicle_category_id,
    p_vehicle_description, p_requested_start, p_estimated_total_cents,
    p_calculated_duration_minutes, p_language, p_customer_message,
    p_idempotency_key, p_vehicle_snapshot, p_service_snapshots
  );

  if not v_result.was_existing then
    update public.reservations
    set package_id = case when p_package_snapshot is null then null else (p_package_snapshot->>'package_id')::uuid end,
        package_code_snapshot = p_package_snapshot->>'package_code',
        package_name_snapshot = p_package_snapshot->>'package_name',
        package_price_cents_snapshot = (p_package_snapshot->>'package_price_cents')::integer,
        package_duration_minutes_snapshot = (p_package_snapshot->>'duration_minutes')::integer,
        package_buffer_minutes_snapshot = case when p_package_snapshot is null then null else coalesce((p_package_snapshot->>'buffer_minutes')::integer, 0) end
    where id = v_result.reservation_id;
  end if;

  return query select
    v_result.reservation_id, v_result.reference, v_result.status,
    v_result.starts_at, v_result.ends_at, v_result.work_bay_id,
    v_result.estimated_total_cents, v_result.calculated_duration_minutes,
    v_result.was_existing;
end;
$$;

revoke all on function public.create_scheduled_reservation_transactional_v2(
  text, text, text, text, uuid, text, timestamptz, integer, integer, text,
  text, uuid, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.create_scheduled_reservation_transactional_v2(
  text, text, text, text, uuid, text, timestamptz, integer, integer, text,
  text, uuid, jsonb, jsonb, jsonb
) to service_role;
