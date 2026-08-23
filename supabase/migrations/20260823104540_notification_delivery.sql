begin;

create or replace function public.claim_notification_outbox(
  p_reservation_id uuid default null,
  p_limit integer default 10
)
returns setof public.notification_outbox
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if p_limit < 1 or p_limit > 50 then
    raise exception 'invalid claim limit' using errcode = '22023';
  end if;

  -- Recover interrupted workers without creating a second delivery record.
  update public.notification_outbox
  set status = 'failed',
      next_attempt_at = now(),
      last_error = 'delivery_worker_timeout',
      updated_at = now()
  where status = 'processing'
    and updated_at < now() - interval '15 minutes';

  return query
  with candidates as (
    select outbox.id
    from public.notification_outbox outbox
    where outbox.status in ('pending', 'failed')
      and outbox.next_attempt_at <= now()
      and outbox.attempt_count < 5
      and (p_reservation_id is null or outbox.reservation_id = p_reservation_id)
    order by outbox.created_at
    for update skip locked
    limit p_limit
  )
  update public.notification_outbox claimed
  set status = 'processing',
      attempt_count = claimed.attempt_count + 1,
      updated_at = now()
  from candidates
  where claimed.id = candidates.id
  returning claimed.*;
end;
$$;

revoke all on function public.claim_notification_outbox(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_notification_outbox(uuid, integer)
  to service_role;

create or replace function public.queue_due_reservation_notifications()
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
  v_added integer;
begin
  insert into public.notification_outbox (
    reservation_id, event_type, audience, recipient, language,
    idempotency_key, next_attempt_at
  )
  select r.id, 'booking_reminder', 'customer', null, r.language,
    r.id::text || ':booking_reminder:customer', now()
  from public.reservations r
  where r.status = 'confirmed'
    and r.starts_at between now() + interval '23 hours' and now() + interval '25 hours'
  on conflict (idempotency_key) do nothing;
  get diagnostics v_added = row_count;
  v_count := v_count + v_added;

  insert into public.notification_outbox (
    reservation_id, event_type, audience, recipient, language,
    idempotency_key, next_attempt_at
  )
  select r.id, 'pending_expiration', 'admin', null, 'en',
    r.id::text || ':pending_expiration:admin', now()
  from public.reservations r
  where r.status = 'pending'
    and r.pending_expires_at between now() and now() + interval '2 hours'
  on conflict (idempotency_key) do nothing;
  get diagnostics v_added = row_count;
  v_count := v_count + v_added;
  return v_count;
end;
$$;

revoke all on function public.queue_due_reservation_notifications()
  from public, anon, authenticated;
grant execute on function public.queue_due_reservation_notifications()
  to service_role;

commit;
