alter function public.admin_save_reservation_transactional(
  uuid, uuid, text, text, text, text, uuid, text, date, date, time,
  smallint, public.reservation_status, integer, integer, text, text, text,
  jsonb, jsonb
) rename to admin_save_reservation_transactional_core;

revoke all on function public.admin_save_reservation_transactional_core(
  uuid, uuid, text, text, text, text, uuid, text, date, date, time,
  smallint, public.reservation_status, integer, integer, text, text, text,
  jsonb, jsonb
) from public, anon, authenticated, service_role;

create function public.admin_save_reservation_transactional(
  p_actor uuid,
  p_reservation_id uuid,
  p_reference text,
  p_full_name text,
  p_phone text,
  p_email text,
  p_vehicle_category_id uuid,
  p_vehicle_description text,
  p_preferred_date date,
  p_confirmed_date date,
  p_start_time time,
  p_duration_slots smallint,
  p_status public.reservation_status,
  p_estimated_total_cents integer,
  p_final_total_cents integer,
  p_customer_message text,
  p_internal_notes text,
  p_language text,
  p_vehicle_snapshot jsonb,
  p_service_snapshots jsonb
)
returns table (
  reservation_id uuid,
  reference text,
  status public.reservation_status
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result record;
begin
  if p_status = 'no_show' then
    if p_reservation_id is null then
      raise exception 'no-show requires an existing reservation' using errcode = '22023';
    end if;

    select * into v_result
    from public.admin_save_reservation_transactional_core(
      p_actor, p_reservation_id, p_reference, p_full_name, p_phone, p_email,
      p_vehicle_category_id, p_vehicle_description, p_preferred_date,
      p_confirmed_date, p_start_time, p_duration_slots, 'cancelled',
      p_estimated_total_cents, p_final_total_cents, p_customer_message,
      p_internal_notes, p_language, p_vehicle_snapshot, p_service_snapshots
    );

    update public.reservations
    set status = 'no_show'
    where id = p_reservation_id;

    update public.reservation_history
    set action = 'reservation_no_show',
        new_value = jsonb_set(new_value, '{status}', '"no_show"'::jsonb, true)
    where id = (
      select id
      from public.reservation_history
      where reservation_id = p_reservation_id
        and changed_by = p_actor
        and action = 'reservation_cancelled'
      order by created_at desc
      limit 1
    );

    return query
    select r.id, r.reference, r.status
    from public.reservations r
    where r.id = p_reservation_id;
    return;
  end if;

  return query
  select result.reservation_id, result.reference, result.status
  from public.admin_save_reservation_transactional_core(
    p_actor, p_reservation_id, p_reference, p_full_name, p_phone, p_email,
    p_vehicle_category_id, p_vehicle_description, p_preferred_date,
    p_confirmed_date, p_start_time, p_duration_slots, p_status,
    p_estimated_total_cents, p_final_total_cents, p_customer_message,
    p_internal_notes, p_language, p_vehicle_snapshot, p_service_snapshots
  ) as result;
end;
$$;

revoke all on function public.admin_save_reservation_transactional(
  uuid, uuid, text, text, text, text, uuid, text, date, date, time,
  smallint, public.reservation_status, integer, integer, text, text, text,
  jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.admin_save_reservation_transactional(
  uuid, uuid, text, text, text, text, uuid, text, date, date, time,
  smallint, public.reservation_status, integer, integer, text, text, text,
  jsonb, jsonb
) to service_role;
