alter table public.reservations alter column source set default 'public_website';

create or replace function public.validate_reservation_segment_total()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_reservation_id uuid := coalesce(new.reservation_id, old.reservation_id);
  v_expected integer;
  v_actual integer;
  v_status public.reservation_status;
  v_bay uuid;
  v_capacity_released_at timestamptz;
begin
  select coalesce(final_duration_minutes, calculated_duration_minutes), status,
    work_bay_id, capacity_released_at
  into v_expected, v_status, v_bay, v_capacity_released_at
  from public.reservations where id = v_reservation_id;

  if v_status in ('pending', 'confirmed', 'in_progress', 'completed')
    and v_capacity_released_at is null
    and v_expected is not null
    and v_bay is not null then
    select coalesce(sum(duration_minutes), 0) into v_actual
    from public.reservation_segments
    where reservation_id = v_reservation_id and occupies_capacity;
    if v_actual <> v_expected then
      raise exception 'reservation segment duration total does not match reservation duration' using errcode = '23514';
    end if;
  end if;
  return null;
end;
$$;

revoke all on function public.validate_reservation_segment_total() from public, anon, authenticated;
grant execute on function public.validate_reservation_segment_total() to service_role;
