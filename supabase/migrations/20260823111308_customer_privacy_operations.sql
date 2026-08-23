begin;

create or replace function public.admin_merge_customers(
  p_actor uuid,
  p_source_customer_id uuid,
  p_target_customer_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_active_admin(p_actor);
  if not exists (select 1 from public.admin_profiles where user_id = p_actor and active and is_active and role = 'admin') then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_source_customer_id = p_target_customer_id then raise exception 'customers must differ' using errcode = '22023'; end if;
  perform 1 from public.customers where id in (p_source_customer_id, p_target_customer_id) for update;
  if (select count(*) from public.customers where id in (p_source_customer_id, p_target_customer_id)) <> 2 then
    raise exception 'customer missing' using errcode = 'P0002';
  end if;

  with moved as (
    update public.reservations set customer_id = p_target_customer_id, updated_at = now()
    where customer_id = p_source_customer_id returning id
  )
  insert into public.reservation_history (reservation_id, changed_by, action, old_value, new_value)
  select id, p_actor, 'customer_merged',
    jsonb_build_object('customer_id', p_source_customer_id),
    jsonb_build_object('customer_id', p_target_customer_id)
  from moved;

  update public.vehicles set customer_id = p_target_customer_id, updated_at = now()
  where customer_id = p_source_customer_id;
  delete from public.customers where id = p_source_customer_id;
  return p_target_customer_id;
end;
$$;

create or replace function public.admin_anonymize_customer(
  p_actor uuid,
  p_customer_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_active_admin(p_actor);
  if not exists (select 1 from public.admin_profiles where user_id = p_actor and active and is_active and role = 'admin') then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason required' using errcode = '22023'; end if;
  if exists (
    select 1 from public.reservations
    where customer_id = p_customer_id and status in ('pending', 'confirmed', 'in_progress')
  ) then raise exception 'active reservations prevent anonymisation' using errcode = 'P0001'; end if;

  insert into public.reservation_history (reservation_id, changed_by, action, new_value)
  select id, p_actor, 'customer_anonymized', jsonb_build_object('reason', left(trim(p_reason), 1000))
  from public.reservations where customer_id = p_customer_id;

  update public.customers
  set full_name = 'Anonymized customer',
      phone = 'anonymized-' || p_customer_id::text,
      email = null,
      normalized_phone = 'anonymized-' || p_customer_id::text,
      normalized_email = 'anonymized-' || p_customer_id::text || '@invalid.local',
      internal_notes = null,
      anonymized_at = now(),
      updated_at = now()
  where id = p_customer_id;
  if not found then raise exception 'customer missing' using errcode = 'P0002'; end if;

  update public.vehicles
  set registration_number = null, normalized_registration = null,
      internal_notes = null, updated_at = now()
  where customer_id = p_customer_id;
  return p_customer_id;
end;
$$;

revoke all on function public.admin_merge_customers(uuid, uuid, uuid),
  public.admin_anonymize_customer(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_merge_customers(uuid, uuid, uuid),
  public.admin_anonymize_customer(uuid, uuid, text)
  to service_role;

commit;
