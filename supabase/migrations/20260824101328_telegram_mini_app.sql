begin;

alter table public.reservations
  drop constraint if exists reservations_source_check;
alter table public.reservations
  add constraint reservations_source_check
  check (source in ('public_website', 'telegram', 'admin', 'phone', 'walk_in', 'legacy'));

create table public.telegram_profiles (
  telegram_user_id bigint primary key check (telegram_user_id > 0),
  customer_id uuid references public.customers(id) on delete set null,
  username text check (username is null or char_length(username) <= 64),
  first_name text not null check (char_length(first_name) between 1 and 100),
  last_name text check (last_name is null or char_length(last_name) <= 100),
  language_code text check (language_code is null or char_length(language_code) <= 16),
  photo_url text check (photo_url is null or (char_length(photo_url) <= 2048 and photo_url ~ '^https://')),
  allows_write_to_pm boolean not null default false,
  write_access_granted_at timestamptz,
  last_authenticated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (allows_write_to_pm or write_access_granted_at is null)
);

create unique index telegram_profiles_customer_unique_idx
  on public.telegram_profiles (customer_id)
  where customer_id is not null;
create index telegram_profiles_last_authenticated_idx
  on public.telegram_profiles (last_authenticated_at desc);

alter table public.reservations
  add column telegram_user_id bigint references public.telegram_profiles(telegram_user_id) on delete set null;
create index reservations_telegram_user_idx
  on public.reservations (telegram_user_id, starts_at desc)
  where telegram_user_id is not null;

create table public.telegram_bot_updates (
  update_id bigint primary key,
  status text not null default 'processing' check (status in ('processing', 'sent', 'failed', 'ignored')),
  attempt_count integer not null default 1 check (attempt_count between 1 and 5),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index telegram_bot_updates_recovery_idx
  on public.telegram_bot_updates (updated_at)
  where status in ('processing', 'failed');

alter table public.notification_outbox
  add column channel text not null default 'email';
alter table public.notification_outbox
  add constraint notification_outbox_channel_check
  check (channel in ('email', 'telegram'));
create index notification_outbox_channel_delivery_idx
  on public.notification_outbox (channel, next_attempt_at, created_at)
  where status in ('pending', 'failed');

create or replace function public.claim_notification_outbox_channel(
  p_channel text,
  p_reservation_id uuid default null,
  p_limit integer default 25
)
returns setof public.notification_outbox
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if p_channel not in ('email', 'telegram') then
    raise exception 'invalid notification channel' using errcode = '22023';
  end if;
  return query
  with selected as (
    select outbox.id
    from public.notification_outbox outbox
    where outbox.channel = p_channel
      and (p_reservation_id is null or outbox.reservation_id = p_reservation_id)
      and outbox.status in ('pending', 'failed')
      and outbox.next_attempt_at <= now()
      and outbox.attempt_count < 6
    order by outbox.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  )
  update public.notification_outbox claimed
  set status = 'processing',
      attempt_count = claimed.attempt_count + 1,
      updated_at = now()
  from selected
  where claimed.id = selected.id
  returning claimed.*;
end;
$$;

create or replace function public.upsert_verified_telegram_profile(
  p_telegram_user_id bigint,
  p_username text,
  p_first_name text,
  p_last_name text,
  p_language_code text,
  p_photo_url text,
  p_allows_write_to_pm boolean
)
returns public.telegram_profiles
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_profile public.telegram_profiles%rowtype;
begin
  if p_telegram_user_id <= 0 or nullif(trim(p_first_name), '') is null then
    raise exception 'invalid telegram profile' using errcode = '22023';
  end if;

  insert into public.telegram_profiles (
    telegram_user_id, username, first_name, last_name, language_code,
    photo_url, allows_write_to_pm, write_access_granted_at, last_authenticated_at
  ) values (
    p_telegram_user_id,
    nullif(left(trim(coalesce(p_username, '')), 64), ''),
    left(trim(p_first_name), 100),
    nullif(left(trim(coalesce(p_last_name, '')), 100), ''),
    nullif(left(trim(coalesce(p_language_code, '')), 16), ''),
    case when p_photo_url ~ '^https://' then left(p_photo_url, 2048) else null end,
    p_allows_write_to_pm,
    case when p_allows_write_to_pm then now() else null end,
    now()
  )
  on conflict (telegram_user_id) do update set
    username = excluded.username,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    language_code = excluded.language_code,
    photo_url = excluded.photo_url,
    allows_write_to_pm = public.telegram_profiles.allows_write_to_pm or excluded.allows_write_to_pm,
    write_access_granted_at = case
      when public.telegram_profiles.allows_write_to_pm or excluded.allows_write_to_pm
        then coalesce(public.telegram_profiles.write_access_granted_at, now())
      else null
    end,
    last_authenticated_at = now(),
    updated_at = now()
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.create_telegram_reservation_transactional_v1(
  p_telegram_user_id bigint,
  p_existing_vehicle_id uuid,
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
  p_service_snapshots jsonb,
  p_package_snapshot jsonb,
  p_condition_snapshot jsonb
)
returns table (
  reservation_id uuid,
  reference text,
  status public.reservation_status,
  starts_at timestamptz,
  ends_at timestamptz,
  work_bay_id uuid,
  estimated_total_cents integer,
  estimated_total_min_cents integer,
  estimated_total_max_cents integer,
  calculated_duration_minutes integer,
  calculated_duration_min_minutes integer,
  calculated_duration_max_minutes integer,
  was_existing boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_profile public.telegram_profiles%rowtype;
  v_saved_vehicle public.vehicles%rowtype;
  v_result record;
  v_reservation public.reservations%rowtype;
  v_temporary_vehicle_id uuid;
begin
  select * into v_profile
  from public.telegram_profiles
  where telegram_user_id = p_telegram_user_id
  for update;
  if not found then
    raise exception 'TELEGRAM_PROFILE_REQUIRED' using errcode = 'P0001';
  end if;

  if p_existing_vehicle_id is not null then
    if v_profile.customer_id is null then
      raise exception 'TELEGRAM_CUSTOMER_REQUIRED' using errcode = 'P0001';
    end if;
    select * into v_saved_vehicle
    from public.vehicles
    where id = p_existing_vehicle_id and customer_id = v_profile.customer_id;
    if not found or v_saved_vehicle.vehicle_category_id <> p_vehicle_category_id then
      raise exception 'TELEGRAM_VEHICLE_NOT_OWNED' using errcode = 'P0001';
    end if;
  end if;

  select * into v_result
  from public.create_scheduled_reservation_transactional_v3(
    p_reference, p_full_name, p_phone, p_email, p_vehicle_category_id,
    p_vehicle_description, p_requested_start, p_estimated_total_cents,
    p_calculated_duration_minutes, p_language, p_customer_message,
    p_idempotency_key, p_vehicle_snapshot, p_service_snapshots,
    p_package_snapshot, p_condition_snapshot
  );

  select * into v_reservation
  from public.reservations
  where id = v_result.reservation_id
  for update;

  if v_result.was_existing then
    if v_reservation.source <> 'telegram' or v_reservation.telegram_user_id is distinct from p_telegram_user_id then
      raise exception 'TELEGRAM_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
  else
    if v_profile.customer_id is not null and v_profile.customer_id <> v_reservation.customer_id then
      raise exception 'TELEGRAM_CUSTOMER_MISMATCH' using errcode = 'P0001';
    end if;

    update public.telegram_profiles
    set customer_id = v_reservation.customer_id, updated_at = now()
    where telegram_user_id = p_telegram_user_id;

    v_temporary_vehicle_id := v_reservation.vehicle_id;
    if p_existing_vehicle_id is not null then
      update public.reservations
      set vehicle_id = p_existing_vehicle_id,
          source = 'telegram',
          telegram_user_id = p_telegram_user_id,
          updated_at = now()
      where id = v_reservation.id;
      delete from public.vehicles
      where id = v_temporary_vehicle_id
        and id <> p_existing_vehicle_id
        and not exists (select 1 from public.reservations where vehicle_id = v_temporary_vehicle_id);
    else
      update public.reservations
      set source = 'telegram', telegram_user_id = p_telegram_user_id, updated_at = now()
      where id = v_reservation.id;
    end if;

    insert into public.reservation_history (reservation_id, changed_by, action, old_value, new_value)
    values (
      v_reservation.id, null, 'telegram_reservation_linked', null,
      jsonb_build_object('telegram_user_id', p_telegram_user_id, 'source', 'telegram')
    );

    if v_profile.allows_write_to_pm then
      insert into public.notification_outbox (
        reservation_id, event_type, audience, recipient, language, channel, idempotency_key
      ) values (
        v_reservation.id, 'booking_requested', 'customer', p_telegram_user_id::text,
        p_language, 'telegram', v_reservation.id::text || ':booking_requested:telegram:' || p_telegram_user_id::text
      ) on conflict (idempotency_key) do nothing;
    end if;
  end if;

  return query
  select r.id, r.reference, r.status, r.starts_at, r.ends_at, r.work_bay_id,
    r.estimated_total_cents, r.estimated_total_min_cents,
    r.estimated_total_max_cents, r.calculated_duration_minutes,
    r.calculated_duration_min_minutes, r.calculated_duration_max_minutes,
    v_result.was_existing
  from public.reservations r where r.id = v_result.reservation_id;
end;
$$;

create or replace function public.telegram_reservation_notifications_trigger()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_telegram_user_id bigint;
  v_event text;
begin
  select telegram_user_id into v_telegram_user_id
  from public.telegram_profiles
  where customer_id = new.customer_id and allows_write_to_pm
  limit 1;
  if v_telegram_user_id is null then return new; end if;

  if new.status is distinct from old.status then
    if new.status = 'confirmed' then v_event := 'booking_confirmed';
    elsif new.status = 'completed' then v_event := 'vehicle_ready';
    elsif new.status = 'cancelled' then v_event := 'booking_cancelled';
    else v_event := null;
    end if;
    if v_event is not null then
      insert into public.notification_outbox (
        reservation_id, event_type, audience, recipient, language, channel, idempotency_key
      ) values (
        new.id, v_event, 'customer', v_telegram_user_id::text, new.language, 'telegram',
        new.id::text || ':' || v_event || ':telegram:' || v_telegram_user_id::text
      ) on conflict (idempotency_key) do nothing;
    end if;
  end if;

  if new.starts_at is distinct from old.starts_at and old.starts_at is not null then
    insert into public.notification_outbox (
      reservation_id, event_type, audience, recipient, language, channel, idempotency_key
    ) values (
      new.id, 'booking_rescheduled', 'customer', v_telegram_user_id::text, new.language, 'telegram',
      new.id::text || ':booking_rescheduled:telegram:' || v_telegram_user_id::text || ':' ||
      extract(epoch from new.starts_at)::bigint::text
    ) on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists telegram_reservation_notifications on public.reservations;
create trigger telegram_reservation_notifications
  after update on public.reservations
  for each row execute function public.telegram_reservation_notifications_trigger();

create or replace function public.queue_due_telegram_notifications()
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  insert into public.notification_outbox (
    reservation_id, event_type, audience, recipient, language, channel,
    idempotency_key, next_attempt_at
  )
  select r.id, 'booking_reminder', 'customer', profile.telegram_user_id::text,
    r.language, 'telegram',
    r.id::text || ':booking_reminder:telegram:' || profile.telegram_user_id::text, now()
  from public.reservations r
  join public.telegram_profiles profile
    on profile.customer_id = r.customer_id and profile.allows_write_to_pm
  where r.status = 'confirmed'
    and r.starts_at between now() + interval '23 hours' and now() + interval '25 hours'
  on conflict (idempotency_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.claim_telegram_bot_update(p_update_id bigint)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_claimed bigint;
begin
  insert into public.telegram_bot_updates (update_id)
  values (p_update_id)
  on conflict (update_id) do update set
    status = 'processing',
    attempt_count = public.telegram_bot_updates.attempt_count + 1,
    last_error = null,
    updated_at = now()
  where public.telegram_bot_updates.status = 'failed'
    and public.telegram_bot_updates.attempt_count < 5
  returning update_id into v_claimed;
  return v_claimed is not null;
end;
$$;

alter table public.telegram_profiles enable row level security;
alter table public.telegram_bot_updates enable row level security;

create policy telegram_profiles_deny_anon on public.telegram_profiles
  for all to anon using (false) with check (false);
create policy telegram_profiles_deny_authenticated on public.telegram_profiles
  for all to authenticated using (false) with check (false);
create policy telegram_bot_updates_deny_anon on public.telegram_bot_updates
  for all to anon using (false) with check (false);
create policy telegram_bot_updates_deny_authenticated on public.telegram_bot_updates
  for all to authenticated using (false) with check (false);

revoke all on table public.telegram_profiles, public.telegram_bot_updates from public, anon, authenticated;
grant select, insert, update, delete on table public.telegram_profiles, public.telegram_bot_updates to service_role;

revoke all on function public.upsert_verified_telegram_profile(bigint, text, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.upsert_verified_telegram_profile(bigint, text, text, text, text, text, boolean)
  to service_role;

revoke all on function public.create_telegram_reservation_transactional_v1(
  bigint, uuid, text, text, text, text, uuid, text, timestamptz, integer,
  integer, text, text, uuid, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.create_telegram_reservation_transactional_v1(
  bigint, uuid, text, text, text, text, uuid, text, timestamptz, integer,
  integer, text, text, uuid, jsonb, jsonb, jsonb, jsonb
) to service_role;

revoke all on function public.queue_due_telegram_notifications() from public, anon, authenticated;
grant execute on function public.queue_due_telegram_notifications() to service_role;
revoke all on function public.claim_notification_outbox_channel(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_notification_outbox_channel(text, uuid, integer)
  to service_role;
revoke all on function public.claim_telegram_bot_update(bigint) from public, anon, authenticated;
grant execute on function public.claim_telegram_bot_update(bigint) to service_role;

commit;
