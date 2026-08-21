create or replace function public.admin_save_duration_reservation_v2(
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
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_reservation public.reservations%rowtype;
  v_old jsonb;
  v_plan record;
  v_duration integer := coalesce(p_final_duration_minutes, p_calculated_duration_minutes);
  v_schedule boolean := p_requested_start is not null and p_status not in ('cancelled', 'expired', 'no_show');
begin
  perform private.assert_active_admin(p_actor);
  perform private.expire_pending_reservations();
  if v_duration <= 0 or p_estimated_total_cents < 0
    or p_source not in ('admin', 'phone', 'walk_in')
    or jsonb_typeof(p_service_snapshots) <> 'array' or jsonb_array_length(p_service_snapshots) = 0 then
    raise exception 'invalid reservation' using errcode = '22023';
  end if;
  if p_status in ('confirmed', 'in_progress', 'completed') and p_requested_start is null then
    raise exception 'scheduled status requires a start' using errcode = '22023';
  end if;
  if v_schedule then
    select * into v_plan from private.exact_plan(v_duration, p_requested_start, p_work_bay_id, p_reservation_id) limit 1;
    if not found then raise exception 'SCHEDULING_CONFLICT' using errcode = 'P0001'; end if;
  end if;

  if p_reservation_id is null then
    insert into public.customers (full_name, phone, email, normalized_email, normalized_phone)
    values (trim(p_full_name), trim(p_phone), nullif(lower(trim(p_email)), ''), lower(trim(p_email)), trim(p_phone))
    returning id into v_customer_id;
    insert into public.vehicles (customer_id, make_model, vehicle_type, vehicle_category_id)
    values (v_customer_id, trim(p_vehicle_description), p_vehicle_snapshot->>'code', p_vehicle_category_id)
    returning id into v_vehicle_id;
    insert into public.reservations (
      reference, customer_id, vehicle_id, preferred_date, status, estimated_total_cents,
      final_total_cents, customer_message, internal_notes, language, vehicle_type_snapshot,
      vehicle_multiplier_snapshot, source, calculated_duration_minutes, final_duration_minutes
    ) values (
      p_reference, v_customer_id, v_vehicle_id, p_preferred_date, p_status,
      p_estimated_total_cents, p_final_total_cents, nullif(p_customer_message, ''),
      nullif(p_internal_notes, ''), p_language, p_vehicle_snapshot->>'code',
      (p_vehicle_snapshot->>'multiplier')::numeric, p_source,
      p_calculated_duration_minutes, p_final_duration_minutes
    ) returning * into v_reservation;
    v_old := null;
  else
    select r.* into v_reservation from public.reservations r where r.id = p_reservation_id for update;
    if not found then raise exception 'reservation not found' using errcode = 'P0002'; end if;
    v_old := to_jsonb(v_reservation) || jsonb_build_object(
      'segments', coalesce((select jsonb_agg(to_jsonb(s) order by s.segment_start) from public.reservation_segments s where s.reservation_id = v_reservation.id), '[]'::jsonb)
    );
    v_customer_id := v_reservation.customer_id;
    v_vehicle_id := v_reservation.vehicle_id;
    update public.customers c set full_name = trim(p_full_name), phone = trim(p_phone),
      email = nullif(lower(trim(p_email)), ''), normalized_email = lower(trim(p_email)),
      normalized_phone = trim(p_phone) where c.id = v_customer_id;
    update public.vehicles v set make_model = trim(p_vehicle_description),
      vehicle_type = p_vehicle_snapshot->>'code', vehicle_category_id = p_vehicle_category_id
      where v.id = v_vehicle_id;
    if v_schedule then
      delete from public.reservation_segments old_segments where old_segments.reservation_id = v_reservation.id;
    else
      update public.reservation_segments old_segments
      set occupies_capacity = false, updated_at = now()
      where old_segments.reservation_id = v_reservation.id and old_segments.occupies_capacity;
    end if;
    delete from public.reservation_services old_items where old_items.reservation_id = v_reservation.id;
    update public.reservations r set
      preferred_date = p_preferred_date, status = p_status,
      estimated_total_cents = p_estimated_total_cents, final_total_cents = p_final_total_cents,
      customer_message = nullif(p_customer_message, ''), internal_notes = nullif(p_internal_notes, ''),
      language = p_language, vehicle_type_snapshot = p_vehicle_snapshot->>'code',
      vehicle_multiplier_snapshot = (p_vehicle_snapshot->>'multiplier')::numeric,
      calculated_duration_minutes = p_calculated_duration_minutes,
      final_duration_minutes = p_final_duration_minutes, source = p_source,
      work_bay_id = null, starts_at = null, ends_at = null, confirmed_date = null,
      completed_at = case when p_status = 'completed' then coalesce(r.completed_at, now()) else null end,
      pending_expires_at = null, capacity_released_at = null, capacity_released_by = null
    where r.id = v_reservation.id returning r.* into v_reservation;
  end if;

  insert into public.reservation_services (
    reservation_id, service_id, service_name_snapshot, base_price_cents_snapshot,
    calculated_price_cents_snapshot, duration_minutes_snapshot, buffer_minutes_snapshot
  ) select v_reservation.id, (item->>'service_id')::uuid, item->>'service_name',
    (item->>'base_price_cents')::integer, (item->>'calculated_price_cents')::integer,
    (item->>'duration_minutes')::integer, coalesce((item->>'buffer_minutes')::integer, 0)
  from jsonb_array_elements(p_service_snapshots) item;

  if v_schedule then
    update public.reservations r set work_bay_id = v_plan.work_bay_id,
      starts_at = v_plan.scheduled_start_at, ends_at = v_plan.estimated_completion_at,
      confirmed_date = case when p_status in ('confirmed', 'in_progress', 'completed')
        then (v_plan.scheduled_start_at at time zone 'Europe/Riga')::date else null end,
      completed_at = case when p_status = 'completed' then coalesce(r.completed_at, now()) else null end
    where r.id = v_reservation.id returning r.* into v_reservation;
    insert into public.reservation_segments (
      reservation_id, work_bay_id, segment_start, segment_end, duration_minutes, occupies_capacity
    ) select v_reservation.id, (entry->>'work_bay_id')::uuid,
      (entry->>'segment_start')::timestamptz, (entry->>'segment_end')::timestamptz,
      (entry->>'duration_minutes')::integer, true
    from jsonb_array_elements(v_plan.segments) entry;
  else
    update public.reservations r set work_bay_id = null, starts_at = null, ends_at = null,
      confirmed_date = null where r.id = v_reservation.id returning r.* into v_reservation;
  end if;

  insert into public.reservation_history (reservation_id, changed_by, action, old_value, new_value)
  values (v_reservation.id, p_actor,
    case when p_reservation_id is null then 'admin_reservation_created'
      when p_status = 'cancelled' then 'reservation_cancelled'
      when p_status = 'expired' then 'reservation_expired'
      when p_status = 'no_show' then 'reservation_no_show'
      when p_status = 'completed' then 'reservation_completed_capacity_retained'
      else 'reservation_rescheduled' end,
    v_old,
    to_jsonb(v_reservation) || jsonb_build_object(
      'segments', coalesce((select jsonb_agg(to_jsonb(s) order by s.segment_start) from public.reservation_segments s where s.reservation_id = v_reservation.id), '[]'::jsonb)
    ));
  return query select v_reservation.id, v_reservation.reference, v_reservation.status;
exception when exclusion_violation then
  raise exception 'SCHEDULING_CONFLICT' using errcode = 'P0001';
end;
$$;

revoke all on function public.admin_save_duration_reservation_v2(
  uuid, uuid, text, text, text, text, uuid, text, date, timestamptz, uuid,
  public.reservation_status, integer, integer, integer, integer, text, text,
  text, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.admin_save_duration_reservation_v2(
  uuid, uuid, text, text, text, text, uuid, text, date, timestamptz, uuid,
  public.reservation_status, integer, integer, integer, integer, text, text,
  text, text, jsonb, jsonb
) to service_role;
