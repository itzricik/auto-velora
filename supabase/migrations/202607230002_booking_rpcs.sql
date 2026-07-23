begin;

create function public.check_rate_limit(
  p_identifier_hash text,
  p_scope text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if char_length(p_identifier_hash) <> 64 or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit input' using errcode = '22023';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.api_rate_limits (
    identifier_hash, scope, window_start, request_count, expires_at
  )
  values (
    p_identifier_hash, p_scope, v_window_start, 1,
    v_window_start + make_interval(secs => p_window_seconds * 2)
  )
  on conflict (identifier_hash, scope, window_start)
  do update set request_count = public.api_rate_limits.request_count + 1
  returning request_count into v_count;

  delete from public.api_rate_limits where expires_at < now();
  return v_count <= p_limit;
end;
$$;

create function public.create_booking_transactional(
  p_reference text,
  p_public_access_token_hash text,
  p_full_name text,
  p_normalized_email text,
  p_normalized_phone text,
  p_vehicle_category_id uuid,
  p_vehicle_description text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_status public.booking_status,
  p_estimated_price_cents integer,
  p_estimated_duration_minutes integer,
  p_pricing_version text,
  p_booking_language text,
  p_customer_notes text,
  p_consent_timestamp timestamptz,
  p_consent_policy_version text,
  p_idempotency_key uuid,
  p_service_snapshots jsonb
)
returns table (
  booking_id uuid,
  reference text,
  status public.booking_status,
  starts_at timestamptz,
  ends_at timestamptz,
  estimated_price_cents integer,
  estimated_duration_minutes integer,
  was_existing boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
  v_bay record;
  v_booking public.bookings%rowtype;
  v_snapshot jsonb;
begin
  select * into v_booking
  from public.bookings
  where idempotency_key = p_idempotency_key;

  if found then
    return query select
      v_booking.id, v_booking.reference, v_booking.status, v_booking.starts_at,
      v_booking.ends_at, v_booking.estimated_price_cents,
      v_booking.estimated_duration_minutes, true;
    return;
  end if;

  insert into public.customers (full_name, normalized_email, normalized_phone)
  values (p_full_name, p_normalized_email, p_normalized_phone)
  on conflict (normalized_email, normalized_phone)
  do update set full_name = excluded.full_name
  returning id into v_customer_id;

  for v_bay in
    select id from public.work_bays where is_active order by code
  loop
    if exists (
      select 1 from public.blocked_periods block
      where (block.work_bay_id is null or block.work_bay_id = v_bay.id)
        and tstzrange(block.starts_at, block.ends_at, '[)')
          && tstzrange(p_starts_at, p_ends_at, '[)')
    ) then
      continue;
    end if;

    begin
      insert into public.bookings (
        reference, public_access_token_hash, customer_id, work_bay_id,
        vehicle_category_id, vehicle_description, starts_at, ends_at, status,
        estimated_price_cents, estimated_duration_minutes, pricing_version,
        booking_language, customer_notes, consent_timestamp, consent_policy_version, idempotency_key,
        confirmed_at
      )
      values (
        p_reference, p_public_access_token_hash, v_customer_id, v_bay.id,
        p_vehicle_category_id, p_vehicle_description, p_starts_at, p_ends_at,
        p_status, p_estimated_price_cents, p_estimated_duration_minutes,
        p_pricing_version, p_booking_language, nullif(p_customer_notes, ''), p_consent_timestamp,
        p_consent_policy_version, p_idempotency_key,
        case when p_status = 'confirmed' then now() else null end
      )
      returning * into v_booking;

      for v_snapshot in select * from jsonb_array_elements(p_service_snapshots)
      loop
        insert into public.booking_services (
          booking_id, service_id, service_name_snapshot,
          unit_price_cents_snapshot, duration_minutes_snapshot, quantity
        )
        values (
          v_booking.id,
          (v_snapshot->>'service_id')::uuid,
          v_snapshot->>'service_name',
          (v_snapshot->>'unit_price_cents')::integer,
          (v_snapshot->>'duration_minutes')::integer,
          coalesce((v_snapshot->>'quantity')::integer, 1)
        );
      end loop;

      insert into public.booking_status_history (
        booking_id, previous_status, new_status, change_source
      )
      values (v_booking.id, null, v_booking.status, 'public_api');

      return query select
        v_booking.id, v_booking.reference, v_booking.status, v_booking.starts_at,
        v_booking.ends_at, v_booking.estimated_price_cents,
        v_booking.estimated_duration_minutes, false;
      return;
    exception
      when exclusion_violation then
        continue;
      when unique_violation then
        select * into v_booking
        from public.bookings
        where idempotency_key = p_idempotency_key;
        if found then
          return query select
            v_booking.id, v_booking.reference, v_booking.status, v_booking.starts_at,
            v_booking.ends_at, v_booking.estimated_price_cents,
            v_booking.estimated_duration_minutes, true;
          return;
        end if;
        raise;
    end;
  end loop;

  raise exception 'slot unavailable' using errcode = '23P01';
end;
$$;

create function public.cancel_public_booking(
  p_reference text,
  p_token_hash text,
  p_reason text,
  p_cancellation_hours integer
)
returns table (
  booking_id uuid,
  status public.booking_status,
  starts_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select * into v_booking
  from public.bookings
  where reference = p_reference
    and public_access_token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if v_booking.status not in ('requested', 'confirmed') then
    raise exception 'cancellation not allowed' using errcode = 'P0001';
  end if;
  if v_booking.starts_at < now() + make_interval(hours => p_cancellation_hours) then
    raise exception 'cancellation cutoff' using errcode = 'P0001';
  end if;

  update public.bookings
  set status = 'cancelled', cancellation_reason = nullif(p_reason, ''),
      cancelled_at = now()
  where id = v_booking.id;

  insert into public.booking_status_history (
    booking_id, previous_status, new_status, change_source, note
  )
  values (v_booking.id, v_booking.status, 'cancelled', 'customer', nullif(p_reason, ''));

  return query select v_booking.id, 'cancelled'::public.booking_status, v_booking.starts_at;
end;
$$;

revoke all on function public.check_rate_limit(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.create_booking_transactional(
  text, text, text, text, text, uuid, text, timestamptz, timestamptz,
  public.booking_status, integer, integer, text, text, text, timestamptz, text, uuid, jsonb
) from public, anon, authenticated;
revoke all on function public.cancel_public_booking(text, text, text, integer) from public, anon, authenticated;

grant execute on function public.check_rate_limit(text, text, integer, integer) to service_role;
grant execute on function public.create_booking_transactional(
  text, text, text, text, text, uuid, text, timestamptz, timestamptz,
  public.booking_status, integer, integer, text, text, text, timestamptz, text, uuid, jsonb
) to service_role;
grant execute on function public.cancel_public_booking(text, text, text, integer) to service_role;

commit;
