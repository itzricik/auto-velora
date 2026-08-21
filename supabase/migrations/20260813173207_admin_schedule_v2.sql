begin;

do $$
begin
  create type public.reservation_status as enum (
    'pending',
    'confirmed',
    'in_progress',
    'completed',
    'cancelled'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.reservation_slot_status as enum (
    'pending',
    'confirmed',
    'in_progress',
    'completed',
    'blocked',
    'cancelled'
  );
exception
  when duplicate_object then null;
end;
$$;

alter table public.customers
  add column if not exists phone text,
  add column if not exists email text;

update public.customers
set phone = normalized_phone,
    email = nullif(normalized_email, '')
where phone is null;

alter table public.customers
  alter column phone set not null;

alter table public.customers
  drop constraint if exists customers_phone_length;
alter table public.customers
  add constraint customers_phone_length check (char_length(phone) between 8 and 32);

alter table public.vehicles
  add column if not exists vehicle_type text;

update public.vehicles vehicle
set vehicle_type = category.code
from public.vehicle_categories category
where vehicle.vehicle_category_id = category.id
  and vehicle.vehicle_type is null;

alter table public.vehicles
  alter column vehicle_type set not null;

alter table public.services
  add column if not exists slug text,
  add column if not exists duration_slots smallint,
  add column if not exists active boolean not null default true;

update public.services
set slug = code,
    duration_slots = least(6, greatest(1, ceil(base_duration_minutes / 120.0)::smallint)),
    active = is_active
where slug is null or duration_slots is null;

alter table public.services
  alter column slug set not null,
  alter column duration_slots set not null;

create unique index if not exists services_slug_unique on public.services (slug);

alter table public.services
  drop constraint if exists services_duration_slots_range;
alter table public.services
  add constraint services_duration_slots_range check (duration_slots between 1 and 6);

alter table public.admin_profiles
  add column if not exists active boolean not null default true;

update public.admin_profiles set active = is_active;

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^VEL-[0-9]{4}-[A-Z0-9]{8}$'),
  customer_id uuid not null references public.customers(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  preferred_date date not null,
  confirmed_date date,
  status public.reservation_status not null default 'pending',
  estimated_total_cents integer not null check (estimated_total_cents >= 0),
  final_total_cents integer check (final_total_cents is null or final_total_cents >= 0),
  customer_message text check (customer_message is null or char_length(customer_message) <= 1500),
  internal_notes text check (internal_notes is null or char_length(internal_notes) <= 5000),
  language text not null check (language in ('en', 'lv', 'ru')),
  vehicle_type_snapshot text not null,
  vehicle_multiplier_snapshot numeric(6, 3) not null check (vehicle_multiplier_snapshot > 0),
  source text not null default 'public' check (source in ('public', 'admin')),
  idempotency_key uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reservation_services (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  service_name_snapshot text not null,
  base_price_cents_snapshot integer not null check (base_price_cents_snapshot >= 0),
  calculated_price_cents_snapshot integer not null check (calculated_price_cents_snapshot >= 0),
  created_at timestamptz not null default now(),
  unique (reservation_id, service_id)
);

create table if not exists public.reservation_slots (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations(id) on delete cascade,
  slot_date date not null,
  start_time time not null,
  end_time time not null,
  status public.reservation_slot_status not null,
  block_reason text check (block_reason is null or char_length(block_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_slots_fixed_intervals check (
    (start_time = time '10:00' and end_time = time '12:00') or
    (start_time = time '12:00' and end_time = time '14:00') or
    (start_time = time '14:00' and end_time = time '16:00') or
    (start_time = time '16:00' and end_time = time '18:00') or
    (start_time = time '18:00' and end_time = time '20:00') or
    (start_time = time '20:00' and end_time = time '22:00')
  ),
  constraint reservation_slots_block_shape check (
    (status = 'blocked' and reservation_id is null and block_reason is not null) or
    (status <> 'blocked' and reservation_id is not null and block_reason is null)
  )
);

create unique index if not exists reservation_slots_active_unique
  on public.reservation_slots (slot_date, start_time)
  where status in ('pending', 'confirmed', 'in_progress', 'completed', 'blocked');

create table if not exists public.reservation_history (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  changed_by uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 2 and 80),
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists reservations_pending_idx
  on public.reservations (preferred_date, created_at)
  where status = 'pending' and confirmed_date is null;
create index if not exists reservations_confirmed_date_idx
  on public.reservations (confirmed_date, status);
create index if not exists reservation_slots_date_idx
  on public.reservation_slots (slot_date, start_time);
create index if not exists reservation_history_reservation_idx
  on public.reservation_history (reservation_id, created_at desc);

drop trigger if exists reservations_updated_at on public.reservations;
create trigger reservations_updated_at
  before update on public.reservations
  for each row execute function public.set_updated_at();

drop trigger if exists reservation_slots_updated_at on public.reservation_slots;
create trigger reservation_slots_updated_at
  before update on public.reservation_slots
  for each row execute function public.set_updated_at();

alter table public.reservations enable row level security;
alter table public.reservation_services enable row level security;
alter table public.reservation_slots enable row level security;
alter table public.reservation_history enable row level security;

revoke all on public.reservations from anon, authenticated;
revoke all on public.reservation_services from anon, authenticated;
revoke all on public.reservation_slots from anon, authenticated;
revoke all on public.reservation_history from anon, authenticated;
grant all on public.reservations to service_role;
grant all on public.reservation_services to service_role;
grant all on public.reservation_slots to service_role;
grant all on public.reservation_history to service_role;

create or replace function public.assert_active_admin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.admin_profiles
    where user_id = p_user_id
      and active = true
      and is_active = true
  ) then
    raise exception 'admin forbidden' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.create_public_reservation_transactional(
  p_reference text,
  p_full_name text,
  p_phone text,
  p_email text,
  p_vehicle_category_id uuid,
  p_vehicle_description text,
  p_preferred_date date,
  p_estimated_total_cents integer,
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
  preferred_date date,
  estimated_total_cents integer,
  was_existing boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_reservation public.reservations%rowtype;
  v_snapshot jsonb;
  v_total integer := 0;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := trim(p_phone);
begin
  select * into v_reservation
  from public.reservations
  where idempotency_key = p_idempotency_key;

  if found then
    return query select v_reservation.id, v_reservation.reference,
      v_reservation.status, v_reservation.preferred_date,
      v_reservation.estimated_total_cents, true;
    return;
  end if;

  if p_preferred_date < (now() at time zone 'Europe/Riga')::date
    or p_preferred_date > (now() at time zone 'Europe/Riga')::date + 365
    or jsonb_typeof(p_vehicle_snapshot) <> 'object'
    or jsonb_typeof(p_service_snapshots) <> 'array'
    or jsonb_array_length(p_service_snapshots) = 0 then
    raise exception 'invalid reservation request' using errcode = '22023';
  end if;

  for v_snapshot in select * from jsonb_array_elements(p_service_snapshots)
  loop
    v_total := v_total + (v_snapshot->>'calculated_price_cents')::integer;
  end loop;
  if v_total <> p_estimated_total_cents then
    raise exception 'snapshot total mismatch' using errcode = '22023';
  end if;

  insert into public.customers (
    full_name, phone, email, normalized_phone, normalized_email
  ) values (
    trim(p_full_name), v_phone, nullif(v_email, ''), v_phone, v_email
  )
  on conflict (normalized_email, normalized_phone)
  do update set
    full_name = excluded.full_name,
    phone = excluded.phone,
    email = excluded.email
  returning id into v_customer_id;

  insert into public.vehicles (
    customer_id, make_model, vehicle_category_id, vehicle_type
  ) values (
    v_customer_id, trim(p_vehicle_description), p_vehicle_category_id,
    p_vehicle_snapshot->>'code'
  ) returning id into v_vehicle_id;

  insert into public.reservations (
    reference, customer_id, vehicle_id, preferred_date, status,
    estimated_total_cents, customer_message, language,
    vehicle_type_snapshot, vehicle_multiplier_snapshot,
    source, idempotency_key
  ) values (
    p_reference, v_customer_id, v_vehicle_id, p_preferred_date, 'pending',
    p_estimated_total_cents, nullif(trim(coalesce(p_customer_message, '')), ''),
    p_language, p_vehicle_snapshot->>'code',
    (p_vehicle_snapshot->>'multiplier')::numeric,
    'public', p_idempotency_key
  ) returning * into v_reservation;

  for v_snapshot in select * from jsonb_array_elements(p_service_snapshots)
  loop
    insert into public.reservation_services (
      reservation_id, service_id, service_name_snapshot,
      base_price_cents_snapshot, calculated_price_cents_snapshot
    ) values (
      v_reservation.id,
      (v_snapshot->>'service_id')::uuid,
      v_snapshot->>'service_name',
      (v_snapshot->>'base_price_cents')::integer,
      (v_snapshot->>'calculated_price_cents')::integer
    );
  end loop;

  insert into public.reservation_history (
    reservation_id, changed_by, action, new_value
  ) values (
    v_reservation.id, null, 'public_request_created',
    jsonb_build_object('status', 'pending', 'preferred_date', p_preferred_date)
  );

  return query select v_reservation.id, v_reservation.reference,
    v_reservation.status, v_reservation.preferred_date,
    v_reservation.estimated_total_cents, false;
end;
$$;

create or replace function public.admin_save_reservation_transactional(
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
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_reservation public.reservations%rowtype;
  v_old jsonb;
  v_snapshot jsonb;
  v_start_index integer;
  v_slot_index integer;
  v_starts time[] := array[time '10:00', time '12:00', time '14:00', time '16:00', time '18:00', time '20:00'];
  v_ends time[] := array[time '12:00', time '14:00', time '16:00', time '18:00', time '20:00', time '22:00'];
  v_slot_status public.reservation_slot_status;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := trim(p_phone);
begin
  perform public.assert_active_admin(p_actor);

  if p_duration_slots not between 1 and 6
    or jsonb_typeof(p_service_snapshots) <> 'array'
    or jsonb_array_length(p_service_snapshots) = 0
    or p_status = 'cancelled' and p_reservation_id is null then
    raise exception 'invalid reservation' using errcode = '22023';
  end if;

  if p_status <> 'cancelled' and p_confirmed_date is not null then
    v_start_index := array_position(v_starts, p_start_time);
    if v_start_index is null or v_start_index + p_duration_slots - 1 > 6 then
      raise exception 'invalid slot range' using errcode = '22023';
    end if;
  end if;

  if p_reservation_id is null then
    insert into public.customers (
      full_name, phone, email, normalized_phone, normalized_email
    ) values (
      trim(p_full_name), v_phone, nullif(v_email, ''), v_phone, v_email
    )
    on conflict (normalized_email, normalized_phone)
    do update set full_name = excluded.full_name, phone = excluded.phone, email = excluded.email
    returning id into v_customer_id;

    insert into public.vehicles (
      customer_id, make_model, vehicle_category_id, vehicle_type
    ) values (
      v_customer_id, trim(p_vehicle_description), p_vehicle_category_id,
      p_vehicle_snapshot->>'code'
    ) returning id into v_vehicle_id;

    insert into public.reservations (
      reference, customer_id, vehicle_id, preferred_date, confirmed_date,
      status, estimated_total_cents, final_total_cents, customer_message,
      internal_notes, language, vehicle_type_snapshot,
      vehicle_multiplier_snapshot, source
    ) values (
      p_reference, v_customer_id, v_vehicle_id, p_preferred_date, p_confirmed_date,
      p_status, p_estimated_total_cents, p_final_total_cents,
      nullif(trim(coalesce(p_customer_message, '')), ''),
      nullif(trim(coalesce(p_internal_notes, '')), ''), p_language,
      p_vehicle_snapshot->>'code',
      (p_vehicle_snapshot->>'multiplier')::numeric, 'admin'
    ) returning * into v_reservation;

    v_old := null;
  else
    select * into v_reservation
    from public.reservations
    where id = p_reservation_id
    for update;
    if not found then
      raise exception 'reservation not found' using errcode = 'P0002';
    end if;

    v_old := to_jsonb(v_reservation);
    v_customer_id := v_reservation.customer_id;
    v_vehicle_id := v_reservation.vehicle_id;

    update public.customers
    set full_name = trim(p_full_name), phone = v_phone, email = nullif(v_email, ''),
        normalized_phone = v_phone, normalized_email = v_email
    where id = v_customer_id;

    update public.vehicles
    set make_model = trim(p_vehicle_description),
        vehicle_category_id = p_vehicle_category_id,
        vehicle_type = p_vehicle_snapshot->>'code'
    where id = v_vehicle_id;

    update public.reservations
    set preferred_date = p_preferred_date,
        confirmed_date = case when p_status = 'cancelled' then confirmed_date else p_confirmed_date end,
        status = p_status,
        estimated_total_cents = p_estimated_total_cents,
        final_total_cents = p_final_total_cents,
        customer_message = nullif(trim(coalesce(p_customer_message, '')), ''),
        internal_notes = nullif(trim(coalesce(p_internal_notes, '')), ''),
        language = p_language,
        vehicle_type_snapshot = p_vehicle_snapshot->>'code',
        vehicle_multiplier_snapshot = (p_vehicle_snapshot->>'multiplier')::numeric
    where id = p_reservation_id
    returning * into v_reservation;

    update public.reservation_slots
    set status = 'cancelled'
    where reservation_id = p_reservation_id
      and status <> 'cancelled';

    delete from public.reservation_services where reservation_id = p_reservation_id;
  end if;

  for v_snapshot in select * from jsonb_array_elements(p_service_snapshots)
  loop
    insert into public.reservation_services (
      reservation_id, service_id, service_name_snapshot,
      base_price_cents_snapshot, calculated_price_cents_snapshot
    ) values (
      v_reservation.id,
      (v_snapshot->>'service_id')::uuid,
      v_snapshot->>'service_name',
      (v_snapshot->>'base_price_cents')::integer,
      (v_snapshot->>'calculated_price_cents')::integer
    );
  end loop;

  if p_status <> 'cancelled' and p_confirmed_date is not null then
    v_slot_status := p_status::text::public.reservation_slot_status;
    for v_slot_index in v_start_index..(v_start_index + p_duration_slots - 1)
    loop
      insert into public.reservation_slots (
        reservation_id, slot_date, start_time, end_time, status
      ) values (
        v_reservation.id, p_confirmed_date,
        v_starts[v_slot_index], v_ends[v_slot_index], v_slot_status
      );
    end loop;
  end if;

  insert into public.reservation_history (
    reservation_id, changed_by, action, old_value, new_value
  ) values (
    v_reservation.id, p_actor,
    case
      when p_reservation_id is null then 'admin_reservation_created'
      when p_status = 'cancelled' then 'reservation_cancelled'
      when p_status = 'completed' then 'reservation_completed'
      when (v_old->>'confirmed_date') is null and p_confirmed_date is not null then 'request_confirmed'
      else 'reservation_updated'
    end,
    v_old,
    to_jsonb(v_reservation) || jsonb_build_object(
      'confirmed_date', p_confirmed_date,
      'start_time', p_start_time,
      'duration_slots', p_duration_slots
    )
  );

  return query select v_reservation.id, v_reservation.reference, v_reservation.status;
end;
$$;

create or replace function public.admin_block_slots_transactional(
  p_actor uuid,
  p_slot_date date,
  p_start_time time,
  p_duration_slots smallint,
  p_reason text
)
returns setof public.reservation_slots
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start_index integer;
  v_slot_index integer;
  v_slot public.reservation_slots%rowtype;
  v_starts time[] := array[time '10:00', time '12:00', time '14:00', time '16:00', time '18:00', time '20:00'];
  v_ends time[] := array[time '12:00', time '14:00', time '16:00', time '18:00', time '20:00', time '22:00'];
begin
  perform public.assert_active_admin(p_actor);
  v_start_index := array_position(v_starts, p_start_time);
  if v_start_index is null or p_duration_slots not between 1 and 6
    or v_start_index + p_duration_slots - 1 > 6
    or char_length(trim(p_reason)) not between 1 and 500 then
    raise exception 'invalid block' using errcode = '22023';
  end if;

  for v_slot_index in v_start_index..(v_start_index + p_duration_slots - 1)
  loop
    insert into public.reservation_slots (
      reservation_id, slot_date, start_time, end_time, status, block_reason
    ) values (
      null, p_slot_date, v_starts[v_slot_index], v_ends[v_slot_index], 'blocked', trim(p_reason)
    ) returning * into v_slot;
    return next v_slot;
  end loop;
end;
$$;

create or replace function public.admin_unblock_slot(
  p_actor uuid,
  p_slot_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_active_admin(p_actor);
  delete from public.reservation_slots
  where id = p_slot_id and reservation_id is null and status = 'blocked';
  return found;
end;
$$;

revoke all on function public.assert_active_admin(uuid) from public, anon, authenticated;
revoke all on function public.create_public_reservation_transactional(text, text, text, text, uuid, text, date, integer, text, text, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.admin_save_reservation_transactional(uuid, uuid, text, text, text, text, uuid, text, date, date, time, smallint, public.reservation_status, integer, integer, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.admin_block_slots_transactional(uuid, date, time, smallint, text) from public, anon, authenticated;
revoke all on function public.admin_unblock_slot(uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_public_reservation_transactional(text, text, text, text, uuid, text, date, integer, text, text, uuid, jsonb, jsonb) to service_role;
grant execute on function public.admin_save_reservation_transactional(uuid, uuid, text, text, text, text, uuid, text, date, date, time, smallint, public.reservation_status, integer, integer, text, text, text, jsonb, jsonb) to service_role;
grant execute on function public.admin_block_slots_transactional(uuid, date, time, smallint, text) to service_role;
grant execute on function public.admin_unblock_slot(uuid, uuid) to service_role;

commit;
