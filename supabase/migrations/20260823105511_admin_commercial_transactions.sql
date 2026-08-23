begin;

create or replace function public.admin_save_duration_reservation_v4(
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
  p_service_snapshots jsonb,
  p_price_override_reason text default null,
  p_duration_override_reason text default null,
  p_checklist_override_reason text default null,
  p_condition_snapshot jsonb default null
)
returns table (reservation_id uuid, reference text, status public.reservation_status)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_result record;
  v_min_price integer;
  v_max_price integer;
  v_min_duration integer;
  v_max_duration integer;
  v_old_reasons jsonb;
begin
  perform public.assert_active_admin(p_actor);
  if nullif(trim(coalesce(p_checklist_override_reason, '')), '') is not null
    and not exists (
      select 1 from public.admin_profiles
      where user_id = p_actor and active and is_active and role = 'admin'
    ) then
    raise exception 'manager checklist override required' using errcode = '42501';
  end if;

  if p_reservation_id is not null then
    select jsonb_build_object(
      'price_override_reason', price_override_reason,
      'duration_override_reason', duration_override_reason,
      'checklist_override_reason', checklist_override_reason
    ) into v_old_reasons
    from public.reservations where id = p_reservation_id for update;

    update public.reservations
    set price_override_reason = nullif(trim(coalesce(p_price_override_reason, '')), ''),
        duration_override_reason = nullif(trim(coalesce(p_duration_override_reason, '')), ''),
        checklist_override_reason = nullif(trim(coalesce(p_checklist_override_reason, '')), ''),
        checklist_override_by = case when nullif(trim(coalesce(p_checklist_override_reason, '')), '') is null then null else p_actor end,
        checklist_override_at = case when nullif(trim(coalesce(p_checklist_override_reason, '')), '') is null then null else now() end
    where id = p_reservation_id;
  end if;

  select * into v_result
  from public.admin_save_duration_reservation_v3(
    p_actor, p_reservation_id, p_reference, p_full_name, p_phone, p_email,
    p_vehicle_category_id, p_vehicle_description, p_preferred_date,
    p_requested_start, p_work_bay_id, p_status, p_estimated_total_cents,
    p_final_total_cents, p_calculated_duration_minutes, p_final_duration_minutes,
    p_customer_message, p_internal_notes, p_language, p_source,
    p_vehicle_snapshot, p_service_snapshots
  );

  if p_reservation_id is null then
    update public.reservations
    set price_override_reason = nullif(trim(coalesce(p_price_override_reason, '')), ''),
        duration_override_reason = nullif(trim(coalesce(p_duration_override_reason, '')), ''),
        checklist_override_reason = nullif(trim(coalesce(p_checklist_override_reason, '')), ''),
        checklist_override_by = case when nullif(trim(coalesce(p_checklist_override_reason, '')), '') is null then null else p_actor end,
        checklist_override_at = case when nullif(trim(coalesce(p_checklist_override_reason, '')), '') is null then null else now() end
    where id = v_result.reservation_id;
  end if;

  if p_condition_snapshot is not null then
    if jsonb_typeof(p_condition_snapshot) <> 'object'
      or nullif(p_condition_snapshot->>'level_id', '') is null then
      raise exception 'invalid condition snapshot' using errcode = '22023';
    end if;
    v_min_price := (p_condition_snapshot->>'total_min_surcharge_cents')::integer;
    v_max_price := (p_condition_snapshot->>'total_max_surcharge_cents')::integer;
    v_min_duration := (p_condition_snapshot->>'total_min_duration_minutes')::integer;
    v_max_duration := (p_condition_snapshot->>'total_max_duration_minutes')::integer;

    insert into public.reservation_conditions (
      reservation_id, condition_level_id, condition_code_snapshot,
      condition_label_snapshot, condition_min_surcharge_cents_snapshot,
      condition_max_surcharge_cents_snapshot, condition_min_duration_minutes_snapshot,
      condition_max_duration_minutes_snapshot, indicator_snapshots,
      total_min_surcharge_cents, total_max_surcharge_cents,
      total_min_duration_minutes, total_max_duration_minutes,
      customer_notes, admin_notes
    ) values (
      v_result.reservation_id, (p_condition_snapshot->>'level_id')::uuid,
      p_condition_snapshot->>'level_code', p_condition_snapshot->>'level_label',
      (p_condition_snapshot->>'level_min_surcharge_cents')::integer,
      (p_condition_snapshot->>'level_max_surcharge_cents')::integer,
      (p_condition_snapshot->>'level_min_duration_minutes')::integer,
      (p_condition_snapshot->>'level_max_duration_minutes')::integer,
      coalesce(p_condition_snapshot->'indicators', '[]'::jsonb),
      v_min_price, v_max_price, v_min_duration, v_max_duration,
      nullif(p_condition_snapshot->>'customer_notes', ''),
      nullif(p_condition_snapshot->>'admin_notes', '')
    ) on conflict (reservation_id) do update set
      condition_level_id = excluded.condition_level_id,
      condition_code_snapshot = excluded.condition_code_snapshot,
      condition_label_snapshot = excluded.condition_label_snapshot,
      condition_min_surcharge_cents_snapshot = excluded.condition_min_surcharge_cents_snapshot,
      condition_max_surcharge_cents_snapshot = excluded.condition_max_surcharge_cents_snapshot,
      condition_min_duration_minutes_snapshot = excluded.condition_min_duration_minutes_snapshot,
      condition_max_duration_minutes_snapshot = excluded.condition_max_duration_minutes_snapshot,
      indicator_snapshots = excluded.indicator_snapshots,
      total_min_surcharge_cents = excluded.total_min_surcharge_cents,
      total_max_surcharge_cents = excluded.total_max_surcharge_cents,
      total_min_duration_minutes = excluded.total_min_duration_minutes,
      total_max_duration_minutes = excluded.total_max_duration_minutes,
      customer_notes = excluded.customer_notes,
      admin_notes = excluded.admin_notes,
      updated_at = now();

    update public.reservations
    set estimated_total_min_cents = p_estimated_total_cents,
        estimated_total_max_cents = p_estimated_total_cents + (v_max_price - v_min_price),
        calculated_duration_min_minutes = p_calculated_duration_minutes - (v_max_duration - v_min_duration),
        calculated_duration_max_minutes = p_calculated_duration_minutes
    where id = v_result.reservation_id;
  end if;

  insert into public.reservation_history (
    reservation_id, changed_by, action, old_value, new_value
  ) values (
    v_result.reservation_id, p_actor, 'commercial_overrides_updated', v_old_reasons,
    jsonb_build_object(
      'price_override_reason', nullif(trim(coalesce(p_price_override_reason, '')), ''),
      'duration_override_reason', nullif(trim(coalesce(p_duration_override_reason, '')), ''),
      'checklist_override_reason', nullif(trim(coalesce(p_checklist_override_reason, '')), ''),
      'condition_level', p_condition_snapshot->>'level_code'
    )
  );

  return query select v_result.reservation_id, v_result.reference, v_result.status;
end;
$$;

revoke all on function public.admin_save_duration_reservation_v4(
  uuid, uuid, text, text, text, text, uuid, text, date, timestamptz, uuid,
  public.reservation_status, integer, integer, integer, integer, text, text,
  text, text, jsonb, jsonb, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.admin_save_duration_reservation_v4(
  uuid, uuid, text, text, text, text, uuid, text, date, timestamptz, uuid,
  public.reservation_status, integer, integer, integer, integer, text, text,
  text, text, jsonb, jsonb, text, text, text, jsonb
) to service_role;

commit;
