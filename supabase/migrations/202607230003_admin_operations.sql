begin;

create function public.admin_update_booking(
  p_booking_id uuid,
  p_changed_by uuid,
  p_new_status public.booking_status,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_internal_notes text,
  p_final_price_cents integer,
  p_note text
)
returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings%rowtype;
  v_previous_status public.booking_status;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'booking not found' using errcode = 'P0002'; end if;
  v_previous_status := v_booking.status;

  if p_new_status is distinct from v_booking.status and not (
    (v_booking.status = 'requested' and p_new_status in ('confirmed', 'rejected', 'cancelled'))
    or (v_booking.status = 'confirmed' and p_new_status in ('in_progress', 'cancelled', 'no_show'))
    or (v_booking.status = 'in_progress' and p_new_status in ('completed', 'cancelled'))
  ) then
    raise exception 'invalid status transition' using errcode = 'P0001';
  end if;

  if coalesce(p_ends_at, v_booking.ends_at) <= coalesce(p_starts_at, v_booking.starts_at) then
    raise exception 'invalid booking interval' using errcode = '22023';
  end if;

  if (
    p_starts_at is not null
    or p_ends_at is not null
    or (
      p_new_status in ('confirmed', 'in_progress')
      and p_new_status is distinct from v_booking.status
    )
  ) and exists (
    select 1 from public.blocked_periods block
    where (block.work_bay_id is null or block.work_bay_id = v_booking.work_bay_id)
      and tstzrange(block.starts_at, block.ends_at, '[)')
        && tstzrange(coalesce(p_starts_at, v_booking.starts_at), coalesce(p_ends_at, v_booking.ends_at), '[)')
  ) then
    raise exception 'slot unavailable' using errcode = '23P01';
  end if;

  update public.bookings set
    status = coalesce(p_new_status, status),
    starts_at = coalesce(p_starts_at, starts_at),
    ends_at = coalesce(p_ends_at, ends_at),
    internal_notes = coalesce(p_internal_notes, internal_notes),
    final_price_cents = coalesce(p_final_price_cents, final_price_cents),
    confirmed_at = case when p_new_status = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end,
    cancelled_at = case when p_new_status = 'cancelled' then coalesce(cancelled_at, now()) else cancelled_at end,
    completed_at = case when p_new_status = 'completed' then coalesce(completed_at, now()) else completed_at end
  where id = p_booking_id
  returning * into v_booking;

  insert into public.booking_status_history (
    booking_id, previous_status, new_status, changed_by, change_source, note
  )
  values (
    v_booking.id, v_previous_status, v_booking.status, p_changed_by, 'admin',
    nullif(p_note, '')
  );

  return v_booking;
exception
  when exclusion_violation then
    raise exception 'slot unavailable' using errcode = '23P01';
end;
$$;

revoke all on function public.admin_update_booking(
  uuid, uuid, public.booking_status, timestamptz, timestamptz, text, integer, text
) from public, anon, authenticated;
grant execute on function public.admin_update_booking(
  uuid, uuid, public.booking_status, timestamptz, timestamptz, text, integer, text
) to service_role;

commit;
