begin;

create extension if not exists btree_gist with schema extensions;

insert into public.work_bays (code, name, is_active)
values
  ('bay_1', 'Bay 1', true),
  ('bay_2', 'Bay 2', true),
  ('bay_3', 'Bay 3', true)
on conflict (code) do update
set name = excluded.name;

update public.business_hours
set opens_at = time '10:00', closes_at = time '20:00', is_closed = false
where weekday between 0 and 6;

create table if not exists public.business_hour_exceptions (
  exception_date date primary key,
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_hour_exceptions_hours check (
    (is_closed and opens_at is null and closes_at is null)
    or (not is_closed and opens_at is not null and closes_at is not null and closes_at > opens_at)
  ),
  constraint business_hour_exceptions_note check (note is null or char_length(note) <= 300)
);

drop trigger if exists business_hour_exceptions_updated_at on public.business_hour_exceptions;
create trigger business_hour_exceptions_updated_at
  before update on public.business_hour_exceptions
  for each row execute function public.set_updated_at();

alter table public.reservations
  add column if not exists work_bay_id uuid references public.work_bays(id) on delete restrict,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists calculated_duration_minutes integer;

alter table public.reservations
  drop constraint if exists reservations_duration_positive,
  add constraint reservations_duration_positive check (
    calculated_duration_minutes is null or calculated_duration_minutes > 0
  ),
  drop constraint if exists reservations_schedule_shape,
  add constraint reservations_schedule_shape check (
    (work_bay_id is null and starts_at is null and ends_at is null)
    or (
      work_bay_id is not null
      and starts_at is not null
      and ends_at is not null
      and calculated_duration_minutes is not null
      and ends_at > starts_at
    )
  );

alter table public.reservation_services
  add column if not exists duration_minutes_snapshot integer;
alter table public.reservation_services
  drop constraint if exists reservation_services_duration_snapshot_positive,
  add constraint reservation_services_duration_snapshot_positive check (
    duration_minutes_snapshot is null or duration_minutes_snapshot > 0
  );

create table if not exists public.reservation_segments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  work_bay_id uuid not null references public.work_bays(id) on delete restrict,
  segment_start timestamptz not null,
  segment_end timestamptz not null,
  duration_minutes integer not null,
  occupies_capacity boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_segments_range check (segment_end > segment_start),
  constraint reservation_segments_duration check (
    duration_minutes > 0
    and duration_minutes = round(extract(epoch from (segment_end - segment_start)) / 60)::integer
  )
);

drop trigger if exists reservation_segments_updated_at on public.reservation_segments;
create trigger reservation_segments_updated_at
  before update on public.reservation_segments
  for each row execute function public.set_updated_at();

alter table public.reservation_segments
  drop constraint if exists reservation_segments_no_overlap;
alter table public.reservation_segments
  add constraint reservation_segments_no_overlap
  exclude using gist (
    work_bay_id with =,
    tstzrange(segment_start, segment_end, '[)') with &&
  ) where (occupies_capacity)
  deferrable initially immediate;

create index if not exists reservation_segments_reservation_idx
  on public.reservation_segments (reservation_id, segment_start);
create index if not exists reservation_segments_schedule_idx
  on public.reservation_segments (work_bay_id, segment_start, segment_end)
  where occupies_capacity;
create index if not exists reservations_starts_at_idx
  on public.reservations (starts_at)
  where starts_at is not null;

alter table public.blocked_periods
  drop constraint if exists blocked_periods_no_overlap;
alter table public.blocked_periods
  add constraint blocked_periods_no_overlap
  exclude using gist (
    work_bay_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (work_bay_id is not null)
  deferrable initially immediate;

create or replace function public.velora_effective_business_hours(p_date date)
returns table (opens_at time, closes_at time, is_closed boolean)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    coalesce(e.opens_at, h.opens_at),
    coalesce(e.closes_at, h.closes_at),
    coalesce(e.is_closed, h.is_closed, true)
  from (select 1) seed
  left join public.business_hour_exceptions e on e.exception_date = p_date
  left join public.business_hours h on h.weekday = extract(dow from p_date)::smallint;
$$;

create or replace function public.velora_calculate_segments(
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
set search_path = public, pg_temp
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
    from public.velora_effective_business_hours(v_date) h;

    if coalesce(v_closed, true) or v_open is null or v_close is null then
      v_cursor := ((v_date + 1) + time '00:00') at time zone 'Europe/Riga';
      continue;
    end if;

    v_open_at := (v_date + v_open) at time zone 'Europe/Riga';
    v_close_at := (v_date + v_close) at time zone 'Europe/Riga';

    if v_cursor < v_open_at then
      v_cursor := v_open_at;
    end if;
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
    v_cursor := case
      when v_remaining > 0 then ((v_date + 1) + time '00:00') at time zone 'Europe/Riga'
      else segment_end
    end;
  end loop;
end;
$$;

create or replace function public.validate_reservation_segment()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_reservation_bay uuid;
  v_local_date date;
  v_open time;
  v_close time;
  v_closed boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.work_bay_id::text || ':' || (new.segment_start at time zone 'Europe/Riga')::date::text, 0));
  select work_bay_id into v_reservation_bay
  from public.reservations where id = new.reservation_id;
  if v_reservation_bay is null or v_reservation_bay <> new.work_bay_id then
    raise exception 'all reservation segments must use the reservation bay' using errcode = '23514';
  end if;

  v_local_date := (new.segment_start at time zone 'Europe/Riga')::date;
  if (new.segment_end at time zone 'Europe/Riga')::date <> v_local_date then
    raise exception 'a segment cannot cross a local day boundary' using errcode = '23514';
  end if;
  select h.opens_at, h.closes_at, h.is_closed into v_open, v_close, v_closed
  from public.velora_effective_business_hours(v_local_date) h;
  if coalesce(v_closed, true)
    or (new.segment_start at time zone 'Europe/Riga')::time < v_open
    or (new.segment_end at time zone 'Europe/Riga')::time > v_close then
    raise exception 'reservation segment is outside working hours' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.blocked_periods b
    where (b.work_bay_id is null or b.work_bay_id = new.work_bay_id)
      and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(new.segment_start, new.segment_end, '[)')
  ) then raise exception 'SCHEDULING_CONFLICT' using errcode = '23P01'; end if;
  return new;
end;
$$;

drop trigger if exists reservation_segment_shape_guard on public.reservation_segments;
create trigger reservation_segment_shape_guard
  before insert or update on public.reservation_segments
  for each row execute function public.validate_reservation_segment();

create or replace function public.validate_blocked_period()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_bay uuid;
begin
  if new.work_bay_id is null then
    for v_bay in select id from public.work_bays where is_active order by id loop
      perform pg_advisory_xact_lock(hashtextextended(v_bay::text || ':' || (new.starts_at at time zone 'Europe/Riga')::date::text, 0));
    end loop;
  else
    perform pg_advisory_xact_lock(hashtextextended(new.work_bay_id::text || ':' || (new.starts_at at time zone 'Europe/Riga')::date::text, 0));
  end if;
  if exists (
    select 1 from public.reservation_segments s
    where s.occupies_capacity
      and (new.work_bay_id is null or s.work_bay_id = new.work_bay_id)
      and tstzrange(s.segment_start, s.segment_end, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then raise exception 'SCHEDULING_CONFLICT' using errcode = '23P01'; end if;
  return new;
end;
$$;

drop trigger if exists blocked_periods_conflict_guard on public.blocked_periods;
create trigger blocked_periods_conflict_guard
  before insert or update on public.blocked_periods
  for each row execute function public.validate_blocked_period();

create or replace function public.validate_reservation_segment_total()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_reservation_id uuid := coalesce(new.reservation_id, old.reservation_id);
  v_expected integer;
  v_actual integer;
  v_status public.reservation_status;
  v_bay uuid;
begin
  select calculated_duration_minutes, status, work_bay_id into v_expected, v_status, v_bay
  from public.reservations where id = v_reservation_id;
  if v_status not in ('cancelled', 'no_show') and v_expected is not null and v_bay is not null then
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

drop trigger if exists reservation_segment_total_guard on public.reservation_segments;
create constraint trigger reservation_segment_total_guard
  after insert or update or delete on public.reservation_segments
  deferrable initially deferred
  for each row execute function public.validate_reservation_segment_total();

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
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.reservations%rowtype;
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_reservation public.reservations%rowtype;
  v_bay record;
  v_end timestamptz;
begin
  select * into v_existing from public.reservations where idempotency_key = p_idempotency_key;
  if found then
    return query select v_existing.id, v_existing.reference, v_existing.status,
      v_existing.starts_at, v_existing.ends_at, v_existing.work_bay_id,
      v_existing.estimated_total_cents, v_existing.calculated_duration_minutes, true;
    return;
  end if;
  if p_requested_start <= now() or p_calculated_duration_minutes <= 0
    or p_estimated_total_cents < 0 or jsonb_typeof(p_service_snapshots) <> 'array'
    or jsonb_array_length(p_service_snapshots) = 0 then
    raise exception 'invalid reservation request' using errcode = '22023';
  end if;

  insert into public.customers (full_name, phone, email, normalized_email, normalized_phone)
  values (trim(p_full_name), trim(p_phone), nullif(lower(trim(p_email)), ''), lower(trim(p_email)), trim(p_phone))
  returning id into v_customer_id;
  insert into public.vehicles (customer_id, make_model, vehicle_type, vehicle_category_id)
  values (v_customer_id, trim(p_vehicle_description), p_vehicle_snapshot->>'code', p_vehicle_category_id)
  returning id into v_vehicle_id;
  insert into public.reservations (
    reference, customer_id, vehicle_id, preferred_date, confirmed_date, status,
    estimated_total_cents, final_total_cents, customer_message, language,
    vehicle_type_snapshot, vehicle_multiplier_snapshot, source, idempotency_key,
    calculated_duration_minutes
  ) values (
    p_reference, v_customer_id, v_vehicle_id,
    (p_requested_start at time zone 'Europe/Riga')::date,
    (p_requested_start at time zone 'Europe/Riga')::date,
    'confirmed', p_estimated_total_cents, null, nullif(p_customer_message, ''), p_language,
    p_vehicle_snapshot->>'code', (p_vehicle_snapshot->>'multiplier')::numeric,
    'public', p_idempotency_key, p_calculated_duration_minutes
  ) returning * into v_reservation;

  insert into public.reservation_services (
    reservation_id, service_id, service_name_snapshot,
    base_price_cents_snapshot, calculated_price_cents_snapshot, duration_minutes_snapshot
  )
  select v_reservation.id, (item->>'service_id')::uuid, item->>'service_name',
    (item->>'base_price_cents')::integer, (item->>'calculated_price_cents')::integer,
    (item->>'duration_minutes')::integer
  from jsonb_array_elements(p_service_snapshots) item;

  for v_bay in select id from public.work_bays where is_active order by code loop
    begin
      if exists (
        select 1
        from public.velora_calculate_segments(p_requested_start, p_calculated_duration_minutes, v_bay.id) candidate
        join public.blocked_periods block
          on (block.work_bay_id is null or block.work_bay_id = v_bay.id)
         and tstzrange(block.starts_at, block.ends_at, '[)') && tstzrange(candidate.segment_start, candidate.segment_end, '[)')
      ) then
        continue;
      end if;

      select max(segment_end) into v_end
      from public.velora_calculate_segments(p_requested_start, p_calculated_duration_minutes, v_bay.id);
      update public.reservations
      set work_bay_id = v_bay.id, starts_at = p_requested_start, ends_at = v_end
      where id = v_reservation.id returning * into v_reservation;
      insert into public.reservation_segments (
        reservation_id, work_bay_id, segment_start, segment_end, duration_minutes
      ) select v_reservation.id, work_bay_id, segment_start, segment_end, duration_minutes
        from public.velora_calculate_segments(p_requested_start, p_calculated_duration_minutes, v_bay.id);
      insert into public.reservation_history (reservation_id, action, new_value)
      values (v_reservation.id, 'public_scheduled_reservation_created',
        jsonb_build_object('start', v_reservation.starts_at, 'end', v_reservation.ends_at, 'bay', v_reservation.work_bay_id));
      return query select v_reservation.id, v_reservation.reference, v_reservation.status,
        v_reservation.starts_at, v_reservation.ends_at, v_reservation.work_bay_id,
        v_reservation.estimated_total_cents, v_reservation.calculated_duration_minutes, false;
      return;
    exception when exclusion_violation then
      -- The subtransaction rolls back this bay's segment inserts; try the next bay.
    end;
  end loop;

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
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_reservation public.reservations%rowtype;
  v_old jsonb;
  v_end timestamptz;
begin
  perform public.assert_active_admin(p_actor);
  if p_calculated_duration_minutes <= 0 or p_estimated_total_cents < 0
    or jsonb_typeof(p_service_snapshots) <> 'array' or jsonb_array_length(p_service_snapshots) = 0 then
    raise exception 'invalid reservation' using errcode = '22023';
  end if;
  if p_status not in ('pending', 'cancelled', 'no_show') and (p_requested_start is null or p_work_bay_id is null) then
    raise exception 'scheduled status requires a start and bay' using errcode = '22023';
  end if;
  if p_work_bay_id is not null and not exists (
    select 1 from public.work_bays where id = p_work_bay_id and is_active
  ) then
    raise exception 'inactive work bay' using errcode = '22023';
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
      vehicle_multiplier_snapshot, source, calculated_duration_minutes
    ) values (
      p_reference, v_customer_id, v_vehicle_id, p_preferred_date, p_status,
      p_estimated_total_cents, p_final_total_cents, nullif(p_customer_message, ''),
      nullif(p_internal_notes, ''), p_language, p_vehicle_snapshot->>'code',
      (p_vehicle_snapshot->>'multiplier')::numeric, 'admin', p_calculated_duration_minutes
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
      work_bay_id = null, starts_at = null, ends_at = null, confirmed_date = null
    where id = v_reservation.id returning * into v_reservation;
  end if;

  insert into public.reservation_services (
    reservation_id, service_id, service_name_snapshot, base_price_cents_snapshot,
    calculated_price_cents_snapshot, duration_minutes_snapshot
  ) select v_reservation.id, (item->>'service_id')::uuid, item->>'service_name',
    (item->>'base_price_cents')::integer, (item->>'calculated_price_cents')::integer,
    (item->>'duration_minutes')::integer
  from jsonb_array_elements(p_service_snapshots) item;

  if p_status not in ('pending', 'cancelled', 'no_show') then
    if exists (
      select 1 from public.velora_calculate_segments(p_requested_start, p_calculated_duration_minutes, p_work_bay_id) candidate
      join public.blocked_periods block
        on (block.work_bay_id is null or block.work_bay_id = p_work_bay_id)
       and tstzrange(block.starts_at, block.ends_at, '[)') && tstzrange(candidate.segment_start, candidate.segment_end, '[)')
    ) then raise exception 'SCHEDULING_CONFLICT' using errcode = 'P0001'; end if;
    select max(segment_end) into v_end
      from public.velora_calculate_segments(p_requested_start, p_calculated_duration_minutes, p_work_bay_id);
    update public.reservations set work_bay_id = p_work_bay_id, starts_at = p_requested_start,
      ends_at = v_end, confirmed_date = (p_requested_start at time zone 'Europe/Riga')::date
    where id = v_reservation.id;
    insert into public.reservation_segments (
      reservation_id, work_bay_id, segment_start, segment_end, duration_minutes
    ) select v_reservation.id, work_bay_id, segment_start, segment_end, duration_minutes
      from public.velora_calculate_segments(p_requested_start, p_calculated_duration_minutes, p_work_bay_id);
    select * into v_reservation from public.reservations where id = v_reservation.id;
  else
    update public.reservations set status = p_status, work_bay_id = null, starts_at = null,
      ends_at = null, confirmed_date = null where id = v_reservation.id returning * into v_reservation;
  end if;

  insert into public.reservation_history (reservation_id, changed_by, action, old_value, new_value)
  values (v_reservation.id, p_actor,
    case when p_reservation_id is null then 'admin_reservation_created'
      when p_status = 'cancelled' then 'reservation_cancelled'
      when p_status = 'completed' then 'reservation_completed'
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

create or replace function public.release_reservation_capacity()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.status in ('cancelled', 'no_show') and old.status is distinct from new.status then
    update public.reservation_segments
    set occupies_capacity = false, updated_at = now()
    where reservation_id = new.id and segment_end > now() and occupies_capacity;
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_release_capacity on public.reservations;
create trigger reservations_release_capacity
  after update of status on public.reservations
  for each row execute function public.release_reservation_capacity();

alter table public.business_hour_exceptions enable row level security;
alter table public.reservation_segments enable row level security;
revoke all on public.business_hour_exceptions from public, anon, authenticated;
revoke all on public.reservation_segments from public, anon, authenticated;
grant all on public.business_hour_exceptions to service_role;
grant all on public.reservation_segments to service_role;

revoke all on function public.velora_effective_business_hours(date) from public, anon, authenticated;
revoke all on function public.velora_calculate_segments(timestamptz, integer, uuid) from public, anon, authenticated;
revoke all on function public.create_scheduled_reservation_transactional(text, text, text, text, uuid, text, timestamptz, integer, integer, text, text, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.admin_save_duration_reservation_transactional(uuid, uuid, text, text, text, text, uuid, text, date, timestamptz, uuid, public.reservation_status, integer, integer, integer, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.velora_effective_business_hours(date) to service_role;
grant execute on function public.velora_calculate_segments(timestamptz, integer, uuid) to service_role;
grant execute on function public.create_scheduled_reservation_transactional(text, text, text, text, uuid, text, timestamptz, integer, integer, text, text, uuid, jsonb, jsonb) to service_role;
grant execute on function public.admin_save_duration_reservation_transactional(uuid, uuid, text, text, text, text, uuid, text, date, timestamptz, uuid, public.reservation_status, integer, integer, integer, text, text, text, jsonb, jsonb) to service_role;

commit;
