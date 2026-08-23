create or replace function public.create_scheduled_reservation_transactional(
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
  p_service_snapshots jsonb
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
  v_existing public.reservations%rowtype;
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_reservation public.reservations%rowtype;
  v_plan record;
  v_hold_minutes integer;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := trim(p_phone);
begin
  perform private.expire_pending_reservations();
  select * into v_existing from public.reservations where idempotency_key = p_idempotency_key;
  if found then
    return query select v_existing.id, v_existing.reference, v_existing.status,
      v_existing.starts_at, v_existing.ends_at, v_existing.work_bay_id,
      v_existing.estimated_total_cents,
      coalesce(v_existing.final_duration_minutes, v_existing.calculated_duration_minutes), true;
    return;
  end if;

  if p_requested_start <= now() or p_calculated_duration_minutes <= 0 or p_estimated_total_cents < 0
    or jsonb_typeof(p_service_snapshots) <> 'array' or jsonb_array_length(p_service_snapshots) = 0 then
    raise exception 'invalid reservation input' using errcode = '22023';
  end if;

  select * into v_plan
  from private.exact_plan(p_calculated_duration_minutes, p_requested_start, null, null)
  limit 1;
  if not found then raise exception 'SCHEDULING_CONFLICT' using errcode = 'P0001'; end if;

  select pending_hold_minutes into v_hold_minutes
  from public.scheduling_settings
  where singleton;

  insert into public.customers (
    full_name, phone, email, normalized_email, normalized_phone
  ) values (
    trim(p_full_name), v_phone, nullif(v_email, ''), v_email, v_phone
  )
  on conflict (normalized_email, normalized_phone)
  do update set
    full_name = excluded.full_name,
    phone = excluded.phone,
    email = excluded.email,
    updated_at = now()
  returning id into v_customer_id;

  insert into public.vehicles (customer_id, make_model, vehicle_type, vehicle_category_id)
  values (v_customer_id, trim(p_vehicle_description), p_vehicle_snapshot->>'code', p_vehicle_category_id)
  returning id into v_vehicle_id;

  insert into public.reservations (
    reference, customer_id, vehicle_id, preferred_date, confirmed_date, status,
    estimated_total_cents, customer_message, language, vehicle_type_snapshot,
    vehicle_multiplier_snapshot, source, idempotency_key, calculated_duration_minutes,
    pending_expires_at, work_bay_id, starts_at, ends_at
  ) values (
    p_reference, v_customer_id, v_vehicle_id,
    (p_requested_start at time zone 'Europe/Riga')::date,
    null, 'pending', p_estimated_total_cents, nullif(p_customer_message, ''), p_language,
    p_vehicle_snapshot->>'code', (p_vehicle_snapshot->>'multiplier')::numeric,
    'public_website', p_idempotency_key, p_calculated_duration_minutes,
    now() + make_interval(mins => v_hold_minutes), v_plan.work_bay_id,
    v_plan.scheduled_start_at, v_plan.estimated_completion_at
  ) returning * into v_reservation;

  insert into public.reservation_services (
    reservation_id, service_id, service_name_snapshot, base_price_cents_snapshot,
    calculated_price_cents_snapshot, duration_minutes_snapshot, buffer_minutes_snapshot
  )
  select
    v_reservation.id,
    (item->>'service_id')::uuid,
    item->>'service_name',
    (item->>'base_price_cents')::integer,
    (item->>'calculated_price_cents')::integer,
    (item->>'duration_minutes')::integer,
    coalesce((item->>'buffer_minutes')::integer, 0)
  from jsonb_array_elements(p_service_snapshots) item;

  insert into public.reservation_segments (
    reservation_id, work_bay_id, segment_start, segment_end, duration_minutes, occupies_capacity
  )
  select
    v_reservation.id,
    (entry->>'work_bay_id')::uuid,
    (entry->>'segment_start')::timestamptz,
    (entry->>'segment_end')::timestamptz,
    (entry->>'duration_minutes')::integer,
    true
  from jsonb_array_elements(v_plan.segments) entry;

  insert into public.reservation_history (reservation_id, changed_by, action, old_value, new_value)
  values (
    v_reservation.id,
    null,
    'public_reservation_created',
    null,
    to_jsonb(v_reservation) || jsonb_build_object('segments', v_plan.segments)
  );

  return query select
    v_reservation.id,
    v_reservation.reference,
    v_reservation.status,
    v_reservation.starts_at,
    v_reservation.ends_at,
    v_reservation.work_bay_id,
    v_reservation.estimated_total_cents,
    v_reservation.calculated_duration_minutes,
    false;
exception
  when exclusion_violation then
    raise exception 'SCHEDULING_CONFLICT' using errcode = 'P0001';
end;
$$;

revoke all on function public.create_scheduled_reservation_transactional(
  text, text, text, text, uuid, text, timestamptz, integer, integer,
  text, text, uuid, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.create_scheduled_reservation_transactional(
  text, text, text, text, uuid, text, timestamptz, integer, integer,
  text, text, uuid, jsonb, jsonb
) to service_role;
