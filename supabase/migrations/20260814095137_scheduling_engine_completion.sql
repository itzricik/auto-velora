create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

alter table public.work_bays
  add column if not exists sort_order integer not null default 0;
update public.work_bays
set sort_order = case code when 'bay_1' then 1 when 'bay_2' then 2 when 'bay_3' then 3 else sort_order end;

alter table public.services
  add column if not exists buffer_minutes integer not null default 0;
alter table public.services
  drop constraint if exists services_buffer_minutes_nonnegative,
  add constraint services_buffer_minutes_nonnegative check (buffer_minutes >= 0);

alter table public.service_packages
  add column if not exists buffer_minutes integer not null default 0;
alter table public.service_packages
  drop constraint if exists service_packages_buffer_minutes_nonnegative,
  add constraint service_packages_buffer_minutes_nonnegative check (buffer_minutes >= 0);

alter table public.reservation_services
  add column if not exists buffer_minutes_snapshot integer not null default 0;
alter table public.reservation_services
  drop constraint if exists reservation_services_buffer_snapshot_nonnegative,
  add constraint reservation_services_buffer_snapshot_nonnegative check (buffer_minutes_snapshot >= 0);

alter table public.reservations
  add column if not exists final_duration_minutes integer,
  add column if not exists pending_expires_at timestamptz,
  add column if not exists capacity_released_at timestamptz,
  add column if not exists capacity_released_by uuid references auth.users(id) on delete set null,
  add column if not exists completed_at timestamptz,
  add column if not exists legacy boolean not null default false;
alter table public.reservations
  drop constraint if exists reservations_final_duration_positive,
  add constraint reservations_final_duration_positive check (final_duration_minutes is null or final_duration_minutes > 0),
  drop constraint if exists reservations_source_check;
update public.reservations set source = 'public_website' where source = 'public';
alter table public.reservations
  add constraint reservations_source_check check (source in ('public_website', 'admin', 'phone', 'walk_in', 'legacy'));
update public.reservations
set legacy = true, source = 'legacy'
where calculated_duration_minutes is null and work_bay_id is null;

create table if not exists public.scheduling_settings (
  singleton boolean primary key default true check (singleton),
  start_interval_minutes integer not null default 30 check (start_interval_minutes between 5 and 120),
  pending_hold_minutes integer not null default 30 check (pending_hold_minutes between 5 and 1440),
  updated_at timestamptz not null default now()
);
insert into public.scheduling_settings (singleton) values (true)
on conflict (singleton) do nothing;
alter table public.scheduling_settings enable row level security;
revoke all on public.scheduling_settings from public, anon, authenticated;
grant all on public.scheduling_settings to service_role;
drop policy if exists server_only on public.scheduling_settings;
create policy server_only on public.scheduling_settings for all to anon, authenticated using (false) with check (false);

create index if not exists reservations_pending_expiry_idx
  on public.reservations (pending_expires_at)
  where status = 'pending' and pending_expires_at is not null;
create index if not exists reservations_capacity_released_by_idx
  on public.reservations (capacity_released_by);

create or replace function private.assert_active_admin(p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
begin
  if p_user_id is null or not exists (
    select 1 from public.admin_profiles
    where user_id = p_user_id and coalesce(active, false) and coalesce(is_active, true)
  ) then
    raise exception 'ADMIN_FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.effective_business_hours(p_date date)
returns table (opens_at time, closes_at time, is_closed boolean)
language sql
stable
security invoker
set search_path = pg_catalog, public, private
as $$
  select
    coalesce(e.opens_at, h.opens_at),
    coalesce(e.closes_at, h.closes_at),
    coalesce(e.is_closed, h.is_closed, true)
  from public.business_hours h
  left join public.business_hour_exceptions e on e.exception_date = p_date
  where h.weekday = extract(dow from p_date)::smallint
$$;

create or replace function private.calculate_segments(
  p_start timestamptz,
  p_duration_minutes integer,
  p_work_bay_id uuid
)
returns table (
  work_bay_id uuid,
  segment_start timestamptz,
  segment_end timestamptz,
  duration_minutes integer
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_remaining integer := p_duration_minutes;
  v_cursor timestamptz := p_start;
  v_date date;
  v_open time;
  v_close time;
  v_closed boolean;
  v_open_at timestamptz;
  v_close_at timestamptz;
  v_take integer;
  v_guard integer := 0;
begin
  if p_start is null or p_duration_minutes <= 0 or p_work_bay_id is null then
    raise exception 'invalid scheduling input' using errcode = '22023';
  end if;

  while v_remaining > 0 loop
    v_guard := v_guard + 1;
    if v_guard > 3660 then
      raise exception 'schedule exceeds supported horizon' using errcode = '22023';
    end if;

    v_date := (v_cursor at time zone 'Europe/Riga')::date;
    select h.opens_at, h.closes_at, h.is_closed
      into v_open, v_close, v_closed
    from private.effective_business_hours(v_date) h;

    if coalesce(v_closed, true) or v_open is null or v_close is null then
      v_cursor := ((v_date + 1) + time '00:00') at time zone 'Europe/Riga';
      continue;
    end if;

    v_open_at := (v_date + v_open) at time zone 'Europe/Riga';
    v_close_at := (v_date + v_close) at time zone 'Europe/Riga';
    if v_cursor < v_open_at then v_cursor := v_open_at; end if;
    if v_cursor >= v_close_at then
      v_cursor := ((v_date + 1) + time '00:00') at time zone 'Europe/Riga';
      continue;
    end if;

    v_take := least(v_remaining, floor(extract(epoch from (v_close_at - v_cursor)) / 60)::integer);
    if v_take <= 0 then
      v_cursor := ((v_date + 1) + time '00:00') at time zone 'Europe/Riga';
      continue;
    end if;

    work_bay_id := p_work_bay_id;
    segment_start := v_cursor;
    segment_end := v_cursor + make_interval(mins => v_take);
    duration_minutes := v_take;
    return next;
    v_remaining := v_remaining - v_take;
    v_cursor := case when v_remaining > 0
      then ((v_date + 1) + time '00:00') at time zone 'Europe/Riga'
      else segment_end end;
  end loop;
end;
$$;

create or replace function private.segments_are_available(
  p_work_bay_id uuid,
  p_segments jsonb,
  p_exclude_reservation_id uuid default null
)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public, private
as $$
  select not exists (
    select 1
    from jsonb_array_elements(p_segments) candidate
    join public.reservation_segments occupied
      on occupied.work_bay_id = p_work_bay_id
     and occupied.occupies_capacity
     and (p_exclude_reservation_id is null or occupied.reservation_id <> p_exclude_reservation_id)
     and tstzrange(occupied.segment_start, occupied.segment_end, '[)')
       && tstzrange((candidate->>'segment_start')::timestamptz, (candidate->>'segment_end')::timestamptz, '[)')
  ) and not exists (
    select 1
    from jsonb_array_elements(p_segments) candidate
    join public.blocked_periods blocked
      on (blocked.work_bay_id is null or blocked.work_bay_id = p_work_bay_id)
     and tstzrange(blocked.starts_at, blocked.ends_at, '[)')
       && tstzrange((candidate->>'segment_start')::timestamptz, (candidate->>'segment_end')::timestamptz, '[)')
  )
$$;

create or replace function private.exact_plan(
  p_duration_minutes integer,
  p_start timestamptz,
  p_work_bay_id uuid default null,
  p_exclude_reservation_id uuid default null
)
returns table (
  work_bay_id uuid,
  scheduled_start_at timestamptz,
  estimated_completion_at timestamptz,
  segments jsonb,
  available_bay_count integer
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_bay record;
  v_segments jsonb;
  v_selected_bay uuid;
  v_selected_segments jsonb;
  v_selected_end timestamptz;
  v_count integer := 0;
begin
  if p_duration_minutes <= 0 or p_start is null or p_start < now() then return; end if;

  for v_bay in
    select id from public.work_bays
    where is_active and (p_work_bay_id is null or id = p_work_bay_id)
    order by sort_order, code, id
  loop
    select jsonb_agg(jsonb_build_object(
      'work_bay_id', s.work_bay_id,
      'segment_start', s.segment_start,
      'segment_end', s.segment_end,
      'duration_minutes', s.duration_minutes
    ) order by s.segment_start)
    into v_segments
    from private.calculate_segments(p_start, p_duration_minutes, v_bay.id) s;

    if v_segments is null
      or (v_segments->0->>'segment_start')::timestamptz <> p_start
      or not private.segments_are_available(v_bay.id, v_segments, p_exclude_reservation_id) then
      continue;
    end if;

    v_count := v_count + 1;
    if v_selected_bay is null then
      v_selected_bay := v_bay.id;
      v_selected_segments := v_segments;
      select max((entry->>'segment_end')::timestamptz) into v_selected_end
      from jsonb_array_elements(v_segments) entry;
    end if;
  end loop;

  if v_selected_bay is null then return; end if;
  work_bay_id := v_selected_bay;
  scheduled_start_at := p_start;
  estimated_completion_at := v_selected_end;
  segments := v_selected_segments;
  available_bay_count := v_count;
  return next;
end;
$$;

create or replace function private.find_nearest_plan(
  p_duration_minutes integer,
  p_not_before timestamptz default null,
  p_desired_date date default null,
  p_work_bay_id uuid default null,
  p_exclude_reservation_id uuid default null,
  p_max_days integer default 90,
  p_increment_minutes integer default 30
)
returns table (
  work_bay_id uuid,
  scheduled_start_at timestamptz,
  estimated_completion_at timestamptz,
  segments jsonb,
  available_bay_count integer
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_not_before timestamptz := greatest(coalesce(p_not_before, now()), now());
  v_today date := (greatest(coalesce(p_not_before, now()), now()) at time zone 'Europe/Riga')::date;
  v_base_date date;
  v_date date;
  v_open time;
  v_close time;
  v_closed boolean;
  v_open_minute integer;
  v_close_minute integer;
  v_first_minute integer;
  v_candidate_minute integer;
  v_candidate timestamptz;
  v_plan record;
  v_day integer;
begin
  if p_duration_minutes <= 0 or p_max_days < 0 or p_max_days > 3660
    or p_increment_minutes < 5 or p_increment_minutes > 120 then return; end if;
  v_base_date := greatest(coalesce(p_desired_date, v_today), v_today);

  for v_day in 0..p_max_days loop
    v_date := v_base_date + v_day;
    select h.opens_at, h.closes_at, h.is_closed into v_open, v_close, v_closed
    from private.effective_business_hours(v_date) h;
    if coalesce(v_closed, true) or v_open is null or v_close is null then continue; end if;

    v_open_minute := extract(hour from v_open)::integer * 60 + extract(minute from v_open)::integer;
    v_close_minute := extract(hour from v_close)::integer * 60 + extract(minute from v_close)::integer;
    v_first_minute := v_open_minute;
    if v_date = (v_not_before at time zone 'Europe/Riga')::date then
      v_first_minute := greatest(v_first_minute,
        extract(hour from (v_not_before at time zone 'Europe/Riga'))::integer * 60
        + extract(minute from (v_not_before at time zone 'Europe/Riga'))::integer
        + case when extract(second from (v_not_before at time zone 'Europe/Riga')) > 0 then 1 else 0 end);
    end if;
    v_first_minute := ((v_first_minute + p_increment_minutes - 1) / p_increment_minutes) * p_increment_minutes;

    v_candidate_minute := v_first_minute;
    while v_candidate_minute < v_close_minute loop
      v_candidate := (v_date + make_interval(mins => v_candidate_minute)) at time zone 'Europe/Riga';
      if v_candidate >= v_not_before then
        select * into v_plan from private.exact_plan(
          p_duration_minutes, v_candidate, p_work_bay_id, p_exclude_reservation_id
        ) limit 1;
        if found then
          work_bay_id := v_plan.work_bay_id;
          scheduled_start_at := v_plan.scheduled_start_at;
          estimated_completion_at := v_plan.estimated_completion_at;
          segments := v_plan.segments;
          available_bay_count := v_plan.available_bay_count;
          return next;
          return;
        end if;
      end if;
      v_candidate_minute := v_candidate_minute + p_increment_minutes;
    end loop;
  end loop;
end;
$$;

create or replace function private.expire_pending_reservations()
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.reservations
    set status = 'expired', updated_at = now()
    where status = 'pending' and pending_expires_at is not null and pending_expires_at <= now()
    returning id
  ), released as (
    update public.reservation_segments s
    set occupies_capacity = false, updated_at = now()
    where s.occupies_capacity and s.reservation_id in (select id from expired)
    returning s.reservation_id
  )
  select count(*) into v_count from expired;
  return v_count;
end;
$$;

create or replace function public.scheduling_availability(
  p_duration_minutes integer,
  p_date date default null,
  p_not_before timestamptz default null,
  p_max_days integer default 90,
  p_increment_minutes integer default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_increment integer;
  v_nearest record;
  v_slots jsonb := '[]'::jsonb;
  v_open time;
  v_close time;
  v_closed boolean;
  v_minute integer;
  v_close_minute integer;
  v_candidate timestamptz;
  v_plan record;
begin
  perform private.expire_pending_reservations();
  select coalesce(p_increment_minutes, start_interval_minutes) into v_increment
  from public.scheduling_settings where singleton;
  select * into v_nearest from private.find_nearest_plan(
    p_duration_minutes, p_not_before, null, null, null, p_max_days, v_increment
  ) limit 1;

  if p_date is not null then
    select h.opens_at, h.closes_at, h.is_closed into v_open, v_close, v_closed
    from private.effective_business_hours(p_date) h;
    if not coalesce(v_closed, true) and v_open is not null and v_close is not null then
      v_minute := extract(hour from v_open)::integer * 60 + extract(minute from v_open)::integer;
      v_close_minute := extract(hour from v_close)::integer * 60 + extract(minute from v_close)::integer;
      while v_minute < v_close_minute loop
        v_candidate := (p_date + make_interval(mins => v_minute)) at time zone 'Europe/Riga';
        if v_candidate >= greatest(coalesce(p_not_before, now()), now()) then
          select * into v_plan from private.exact_plan(p_duration_minutes, v_candidate, null, null) limit 1;
          if found then
            v_slots := v_slots || jsonb_build_array(jsonb_build_object(
              'start', v_plan.scheduled_start_at,
              'end', v_plan.estimated_completion_at,
              'durationMinutes', p_duration_minutes,
              'availableBayCount', v_plan.available_bay_count,
              'segments', (select jsonb_agg(entry - 'work_bay_id') from jsonb_array_elements(v_plan.segments) entry)
            ));
          end if;
        end if;
        v_minute := v_minute + v_increment;
      end loop;
    end if;
  end if;

  return jsonb_build_object(
    'durationMinutes', p_duration_minutes,
    'nearest', case when v_nearest.work_bay_id is null then null else jsonb_build_object(
      'start', v_nearest.scheduled_start_at,
      'end', v_nearest.estimated_completion_at,
      'durationMinutes', p_duration_minutes,
      'availableBayCount', v_nearest.available_bay_count,
      'segments', (select jsonb_agg(entry - 'work_bay_id') from jsonb_array_elements(v_nearest.segments) entry)
    ) end,
    'slots', v_slots
  );
end;
$$;

create or replace function public.admin_scheduling_preview(
  p_actor uuid,
  p_duration_minutes integer,
  p_requested_start timestamptz,
  p_work_bay_id uuid default null,
  p_reservation_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare v_plan record;
begin
  perform private.assert_active_admin(p_actor);
  perform private.expire_pending_reservations();
  select * into v_plan from private.exact_plan(
    p_duration_minutes, p_requested_start, p_work_bay_id, p_reservation_id
  ) limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'workBayId', v_plan.work_bay_id,
    'start', v_plan.scheduled_start_at,
    'end', v_plan.estimated_completion_at,
    'durationMinutes', p_duration_minutes,
    'availableBayCount', v_plan.available_bay_count,
    'segments', v_plan.segments
  );
end;
$$;

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
begin
  perform private.expire_pending_reservations();
  select * into v_existing from public.reservations where idempotency_key = p_idempotency_key;
  if found then
    return query select v_existing.id, v_existing.reference, v_existing.status,
      v_existing.starts_at, v_existing.ends_at, v_existing.work_bay_id,
      v_existing.estimated_total_cents, coalesce(v_existing.final_duration_minutes, v_existing.calculated_duration_minutes), true;
    return;
  end if;
  if p_requested_start <= now() or p_calculated_duration_minutes <= 0 or p_estimated_total_cents < 0
    or jsonb_typeof(p_service_snapshots) <> 'array' or jsonb_array_length(p_service_snapshots) = 0 then
    raise exception 'invalid reservation input' using errcode = '22023';
  end if;
  select * into v_plan from private.exact_plan(p_calculated_duration_minutes, p_requested_start, null, null) limit 1;
  if not found then raise exception 'SCHEDULING_CONFLICT' using errcode = 'P0001'; end if;
  select pending_hold_minutes into v_hold_minutes from public.scheduling_settings where singleton;

  insert into public.customers (full_name, phone, email, normalized_email, normalized_phone)
  values (trim(p_full_name), trim(p_phone), nullif(lower(trim(p_email)), ''), lower(trim(p_email)), trim(p_phone))
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
  ) select v_reservation.id, (item->>'service_id')::uuid, item->>'service_name',
    (item->>'base_price_cents')::integer, (item->>'calculated_price_cents')::integer,
    (item->>'duration_minutes')::integer, coalesce((item->>'buffer_minutes')::integer, 0)
  from jsonb_array_elements(p_service_snapshots) item;

  insert into public.reservation_segments (
    reservation_id, work_bay_id, segment_start, segment_end, duration_minutes, occupies_capacity
  ) select v_reservation.id, (entry->>'work_bay_id')::uuid,
    (entry->>'segment_start')::timestamptz, (entry->>'segment_end')::timestamptz,
    (entry->>'duration_minutes')::integer, true
  from jsonb_array_elements(v_plan.segments) entry;

  insert into public.reservation_history (reservation_id, changed_by, action, old_value, new_value)
  values (v_reservation.id, null, 'public_reservation_created', null,
    to_jsonb(v_reservation) || jsonb_build_object('segments', v_plan.segments));
  return query select v_reservation.id, v_reservation.reference, v_reservation.status,
    v_reservation.starts_at, v_reservation.ends_at, v_reservation.work_bay_id,
    v_reservation.estimated_total_cents, v_reservation.calculated_duration_minutes, false;
exception when exclusion_violation then
  raise exception 'SCHEDULING_CONFLICT' using errcode = 'P0001';
end;
$$;

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
    select * into v_reservation from public.reservations where id = p_reservation_id for update;
    if not found then raise exception 'reservation not found' using errcode = 'P0002'; end if;
    v_old := to_jsonb(v_reservation) || jsonb_build_object(
      'segments', coalesce((select jsonb_agg(to_jsonb(s) order by s.segment_start) from public.reservation_segments s where s.reservation_id = v_reservation.id), '[]'::jsonb)
    );
    v_customer_id := v_reservation.customer_id;
    v_vehicle_id := v_reservation.vehicle_id;
    update public.customers set full_name = trim(p_full_name), phone = trim(p_phone),
      email = nullif(lower(trim(p_email)), ''), normalized_email = lower(trim(p_email)),
      normalized_phone = trim(p_phone) where id = v_customer_id;
    update public.vehicles set make_model = trim(p_vehicle_description),
      vehicle_type = p_vehicle_snapshot->>'code', vehicle_category_id = p_vehicle_category_id
      where id = v_vehicle_id;
    delete from public.reservation_segments where reservation_id = v_reservation.id;
    delete from public.reservation_services where reservation_id = v_reservation.id;
    update public.reservations set
      preferred_date = p_preferred_date, status = p_status,
      estimated_total_cents = p_estimated_total_cents, final_total_cents = p_final_total_cents,
      customer_message = nullif(p_customer_message, ''), internal_notes = nullif(p_internal_notes, ''),
      language = p_language, vehicle_type_snapshot = p_vehicle_snapshot->>'code',
      vehicle_multiplier_snapshot = (p_vehicle_snapshot->>'multiplier')::numeric,
      calculated_duration_minutes = p_calculated_duration_minutes,
      final_duration_minutes = p_final_duration_minutes, source = p_source,
      work_bay_id = null, starts_at = null, ends_at = null, confirmed_date = null,
      completed_at = case when p_status = 'completed' then coalesce(completed_at, now()) else null end,
      pending_expires_at = null, capacity_released_at = null, capacity_released_by = null
    where id = v_reservation.id returning * into v_reservation;
  end if;

  insert into public.reservation_services (
    reservation_id, service_id, service_name_snapshot, base_price_cents_snapshot,
    calculated_price_cents_snapshot, duration_minutes_snapshot, buffer_minutes_snapshot
  ) select v_reservation.id, (item->>'service_id')::uuid, item->>'service_name',
    (item->>'base_price_cents')::integer, (item->>'calculated_price_cents')::integer,
    (item->>'duration_minutes')::integer, coalesce((item->>'buffer_minutes')::integer, 0)
  from jsonb_array_elements(p_service_snapshots) item;

  if v_schedule then
    update public.reservations set work_bay_id = v_plan.work_bay_id,
      starts_at = v_plan.scheduled_start_at, ends_at = v_plan.estimated_completion_at,
      confirmed_date = case when p_status in ('confirmed', 'in_progress', 'completed')
        then (v_plan.scheduled_start_at at time zone 'Europe/Riga')::date else null end,
      completed_at = case when p_status = 'completed' then coalesce(completed_at, now()) else null end
    where id = v_reservation.id returning * into v_reservation;
    insert into public.reservation_segments (
      reservation_id, work_bay_id, segment_start, segment_end, duration_minutes, occupies_capacity
    ) select v_reservation.id, (entry->>'work_bay_id')::uuid,
      (entry->>'segment_start')::timestamptz, (entry->>'segment_end')::timestamptz,
      (entry->>'duration_minutes')::integer, true
    from jsonb_array_elements(v_plan.segments) entry;
  else
    update public.reservations set work_bay_id = null, starts_at = null, ends_at = null,
      confirmed_date = null where id = v_reservation.id returning * into v_reservation;
  end if;

  insert into public.reservation_history (reservation_id, changed_by, action, old_value, new_value)
  values (v_reservation.id, p_actor,
    case when p_reservation_id is null then 'admin_reservation_created'
      when p_status = 'cancelled' then 'reservation_cancelled'
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

create or replace function public.admin_save_duration_reservation_transactional(
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
  p_customer_message text,
  p_internal_notes text,
  p_language text,
  p_vehicle_snapshot jsonb,
  p_service_snapshots jsonb
)
returns table (reservation_id uuid, reference text, status public.reservation_status)
language sql
security invoker
set search_path = pg_catalog, public, private
as $$
  select * from public.admin_save_duration_reservation_v2(
    p_actor, p_reservation_id, p_reference, p_full_name, p_phone, p_email,
    p_vehicle_category_id, p_vehicle_description, p_preferred_date,
    p_requested_start, p_work_bay_id, p_status, p_estimated_total_cents,
    p_final_total_cents, p_calculated_duration_minutes, null,
    p_customer_message, p_internal_notes, p_language, 'admin',
    p_vehicle_snapshot, p_service_snapshots
  )
$$;

create or replace function public.admin_release_reservation_capacity(
  p_actor uuid,
  p_reservation_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare v_old jsonb; v_new jsonb;
begin
  perform private.assert_active_admin(p_actor);
  select to_jsonb(r) into v_old from public.reservations r where id = p_reservation_id for update;
  if v_old is null then raise exception 'reservation not found' using errcode = 'P0002'; end if;
  update public.reservations set status = 'completed', completed_at = coalesce(completed_at, now()),
    capacity_released_at = now(), capacity_released_by = p_actor, updated_at = now()
  where id = p_reservation_id;
  update public.reservation_segments set occupies_capacity = false, updated_at = now()
  where reservation_id = p_reservation_id and occupies_capacity and segment_end > now();
  select to_jsonb(r) into v_new from public.reservations r where id = p_reservation_id;
  insert into public.reservation_history (reservation_id, changed_by, action, old_value, new_value)
  values (p_reservation_id, p_actor, 'reservation_completed_and_capacity_released', v_old, v_new);
end;
$$;

create or replace function public.release_reservation_capacity()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
begin
  if new.status in ('cancelled', 'expired', 'no_show') and old.status is distinct from new.status then
    update public.reservation_segments
    set occupies_capacity = false, updated_at = now()
    where reservation_id = new.id and occupies_capacity and segment_end > now();
  end if;
  return new;
end;
$$;

create or replace function public.expire_pending_reservations()
returns integer
language sql
security invoker
set search_path = pg_catalog, public, private
as $$ select private.expire_pending_reservations() $$;

create or replace function public.assert_active_admin(p_user_id uuid)
returns void
language sql
security invoker
set search_path = pg_catalog, public, private
as $$ select private.assert_active_admin(p_user_id) $$;

create or replace function public.velora_calculate_segments(
  p_start timestamptz,
  p_duration_minutes integer,
  p_work_bay_id uuid
)
returns table (work_bay_id uuid, segment_start timestamptz, segment_end timestamptz, duration_minutes integer)
language sql
stable
security invoker
set search_path = pg_catalog, public, private
as $$ select * from private.calculate_segments(p_start, p_duration_minutes, p_work_bay_id) $$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to service_role;

revoke all on function public.scheduling_availability(integer, date, timestamptz, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_scheduling_preview(uuid, integer, timestamptz, uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_save_duration_reservation_v2(uuid, uuid, text, text, text, text, uuid, text, date, timestamptz, uuid, public.reservation_status, integer, integer, integer, integer, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.admin_release_reservation_capacity(uuid, uuid) from public, anon, authenticated;
revoke all on function public.expire_pending_reservations() from public, anon, authenticated;
revoke all on function public.create_scheduled_reservation_transactional(text, text, text, text, uuid, text, timestamptz, integer, integer, text, text, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.admin_save_duration_reservation_transactional(uuid, uuid, text, text, text, text, uuid, text, date, timestamptz, uuid, public.reservation_status, integer, integer, integer, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.assert_active_admin(uuid) from public, anon, authenticated;
revoke all on function public.velora_calculate_segments(timestamptz, integer, uuid) from public, anon, authenticated;

grant execute on function public.scheduling_availability(integer, date, timestamptz, integer, integer) to service_role;
grant execute on function public.admin_scheduling_preview(uuid, integer, timestamptz, uuid, uuid) to service_role;
grant execute on function public.admin_save_duration_reservation_v2(uuid, uuid, text, text, text, text, uuid, text, date, timestamptz, uuid, public.reservation_status, integer, integer, integer, integer, text, text, text, text, jsonb, jsonb) to service_role;
grant execute on function public.admin_release_reservation_capacity(uuid, uuid) to service_role;
grant execute on function public.expire_pending_reservations() to service_role;
grant execute on function public.create_scheduled_reservation_transactional(text, text, text, text, uuid, text, timestamptz, integer, integer, text, text, uuid, jsonb, jsonb) to service_role;
grant execute on function public.admin_save_duration_reservation_transactional(uuid, uuid, text, text, text, text, uuid, text, date, timestamptz, uuid, public.reservation_status, integer, integer, integer, text, text, text, jsonb, jsonb) to service_role;
grant execute on function public.assert_active_admin(uuid) to service_role;
grant execute on function public.velora_calculate_segments(timestamptz, integer, uuid) to service_role;
