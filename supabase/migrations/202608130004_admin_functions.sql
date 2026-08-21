begin;

create function public.admin_update_booking(
  p_booking_id uuid,
  p_changed_by uuid,
  p_new_status public.booking_status default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_internal_notes text default null,
  p_final_price_cents integer default null,
  p_note text default null
)
returns public.booking_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current public.booking_requests%rowtype;
  v_result public.booking_requests%rowtype;
begin
  if not exists (
    select 1 from public.admin_profiles
    where user_id = p_changed_by and is_active
  ) then
    raise exception 'administrator not authorized' using errcode = '42501';
  end if;

  select * into v_current
  from public.booking_requests
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;

  if p_new_status is not null and p_new_status <> v_current.status and not (
    (v_current.status = 'new' and p_new_status in ('contacted', 'confirmed', 'cancelled')) or
    (v_current.status = 'contacted' and p_new_status in ('confirmed', 'cancelled')) or
    (v_current.status = 'confirmed' and p_new_status in ('in_progress', 'cancelled', 'no_show')) or
    (v_current.status = 'in_progress' and p_new_status in ('completed', 'cancelled'))
  ) then
    raise exception 'invalid status transition' using errcode = 'P0001';
  end if;

  if (p_starts_at is null) <> (p_ends_at is null) then
    raise exception 'both interval values are required' using errcode = '22023';
  end if;
  if p_starts_at is not null and p_ends_at <= p_starts_at then
    raise exception 'invalid interval' using errcode = '22023';
  end if;
  if p_internal_notes is not null and char_length(p_internal_notes) > 5000 then
    raise exception 'internal notes too long' using errcode = '22001';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'history note too long' using errcode = '22001';
  end if;
  if p_final_price_cents is not null and p_final_price_cents < 0 then
    raise exception 'invalid final price' using errcode = '22023';
  end if;

  update public.booking_requests
  set
    status = coalesce(p_new_status, status),
    starts_at = coalesce(p_starts_at, starts_at),
    ends_at = coalesce(p_ends_at, ends_at),
    preferred_date = case
      when p_starts_at is null then preferred_date
      else (p_starts_at at time zone 'Europe/Riga')::date
    end,
    internal_notes = coalesce(p_internal_notes, internal_notes),
    final_price_cents = coalesce(p_final_price_cents, final_price_cents),
    contacted_at = case when p_new_status = 'contacted' then now() else contacted_at end,
    confirmed_at = case when p_new_status = 'confirmed' then now() else confirmed_at end,
    cancelled_at = case when p_new_status = 'cancelled' then now() else cancelled_at end,
    completed_at = case when p_new_status = 'completed' then now() else completed_at end
  where id = p_booking_id
  returning * into v_result;

  if p_new_status is not null and p_new_status <> v_current.status then
    insert into public.booking_history (
      booking_request_id, previous_status, new_status, changed_by, change_source, note
    ) values (
      p_booking_id, v_current.status, p_new_status, p_changed_by, 'admin', nullif(p_note, '')
    );
  elsif p_note is not null and p_note <> '' then
    insert into public.booking_history (
      booking_request_id, previous_status, new_status, changed_by, change_source, note
    ) values (
      p_booking_id, v_current.status, v_current.status, p_changed_by, 'admin', p_note
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.admin_update_booking(
  uuid, uuid, public.booking_status, timestamptz, timestamptz, text, integer, text
) from public, anon, authenticated;
grant execute on function public.admin_update_booking(
  uuid, uuid, public.booking_status, timestamptz, timestamptz, text, integer, text
) to service_role;

commit;
