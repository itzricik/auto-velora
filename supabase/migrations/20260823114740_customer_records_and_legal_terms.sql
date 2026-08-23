begin;

alter table public.business_configuration
  add column if not exists booking_terms_en text,
  add column if not exists booking_terms_lv text,
  add column if not exists booking_terms_ru text;

insert into public.checklist_template_items (
  template_id, label, is_required, sort_order
)
select id, 'Protection applied', false, 55
from public.checklist_templates
where code = 'standard'
on conflict (template_id, sort_order) do nothing;

create or replace function public.admin_update_customer_vehicle(
  p_actor uuid,
  p_reservation_id uuid,
  p_customer_id uuid,
  p_vehicle_id uuid,
  p_full_name text,
  p_phone text,
  p_email text,
  p_customer_notes text,
  p_registration_number text,
  p_applied_protection text,
  p_recommended_maintenance_date date,
  p_vehicle_notes text
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_phone text := regexp_replace(trim(coalesce(p_phone, '')), '[^0-9+]', '', 'g');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_registration text := nullif(upper(trim(coalesce(p_registration_number, ''))), '');
  v_old jsonb;
  v_new jsonb;
begin
  perform public.assert_active_admin(p_actor);
  if char_length(trim(coalesce(p_full_name, ''))) not between 2 and 100
    or char_length(v_phone) not between 8 and 32
    or char_length(v_email) > 254
    or (v_email <> '' and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    or char_length(coalesce(p_customer_notes, '')) > 5000
    or char_length(coalesce(p_vehicle_notes, '')) > 5000
    or char_length(coalesce(p_applied_protection, '')) > 500
    or char_length(coalesce(v_registration, '')) > 32 then
    raise exception 'invalid customer record' using errcode = '22023';
  end if;
  if left(v_phone, 2) = '00' then v_phone := '+' || substr(v_phone, 3); end if;

  select jsonb_build_object(
    'customer', jsonb_build_object(
      'full_name', c.full_name, 'phone', c.phone, 'email', c.email,
      'internal_notes', c.internal_notes
    ),
    'vehicle', jsonb_build_object(
      'registration_number', v.registration_number,
      'applied_protection', v.applied_protection,
      'recommended_maintenance_date', v.recommended_maintenance_date,
      'internal_notes', v.internal_notes
    )
  ) into v_old
  from public.customers c
  join public.vehicles v on v.id = p_vehicle_id and v.customer_id = c.id
  where c.id = p_customer_id
  for update of c, v;
  if not found then raise exception 'customer vehicle record missing' using errcode = 'P0002'; end if;
  if not exists (
    select 1 from public.reservations
    where id = p_reservation_id and customer_id = p_customer_id and vehicle_id = p_vehicle_id
  ) then raise exception 'reservation relationship mismatch' using errcode = '42501'; end if;

  update public.customers
  set full_name = trim(p_full_name),
      phone = v_phone,
      email = nullif(v_email, ''),
      normalized_phone = v_phone,
      normalized_email = v_email,
      internal_notes = nullif(trim(coalesce(p_customer_notes, '')), ''),
      updated_at = now()
  where id = p_customer_id;

  update public.vehicles
  set registration_number = v_registration,
      normalized_registration = case when v_registration is null then null else regexp_replace(v_registration, '[^A-Z0-9]', '', 'g') end,
      applied_protection = nullif(trim(coalesce(p_applied_protection, '')), ''),
      recommended_maintenance_date = p_recommended_maintenance_date,
      internal_notes = nullif(trim(coalesce(p_vehicle_notes, '')), ''),
      updated_at = now()
  where id = p_vehicle_id;

  v_new := jsonb_build_object(
    'customer', jsonb_build_object(
      'full_name', trim(p_full_name), 'phone', v_phone,
      'email', nullif(v_email, ''),
      'internal_notes', nullif(trim(coalesce(p_customer_notes, '')), '')
    ),
    'vehicle', jsonb_build_object(
      'registration_number', v_registration,
      'applied_protection', nullif(trim(coalesce(p_applied_protection, '')), ''),
      'recommended_maintenance_date', p_recommended_maintenance_date,
      'internal_notes', nullif(trim(coalesce(p_vehicle_notes, '')), '')
    )
  );
  insert into public.reservation_history (
    reservation_id, changed_by, action, old_value, new_value
  ) values (
    p_reservation_id, p_actor, 'customer_vehicle_corrected', v_old, v_new
  );
  return p_customer_id;
end;
$$;

revoke all on function public.admin_update_customer_vehicle(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, date, text
) from public, anon, authenticated;
grant execute on function public.admin_update_customer_vehicle(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, date, text
) to service_role;

create or replace function public.finalize_reservation_media_upload(
  p_media_id uuid,
  p_expected_uploader text
)
returns public.reservation_media
language plpgsql
security invoker
set search_path = pg_catalog, public, storage
as $$
declare
  v_media public.reservation_media%rowtype;
  v_object storage.objects%rowtype;
begin
  if p_expected_uploader not in ('customer', 'admin') then
    raise exception 'invalid media uploader' using errcode = '22023';
  end if;
  select * into v_media
  from public.reservation_media
  where id = p_media_id and uploaded_by_type = p_expected_uploader
    and deleted_at is null
  for update;
  if not found then raise exception 'media record missing' using errcode = 'P0002'; end if;

  select * into v_object
  from storage.objects
  where bucket_id = v_media.storage_bucket and name = v_media.storage_path;
  if not found then raise exception 'uploaded object missing' using errcode = 'P0002'; end if;
  if coalesce((v_object.metadata->>'size')::bigint, 0) < 1
    or coalesce((v_object.metadata->>'size')::bigint, 0) > 8388608
    or coalesce(v_object.metadata->>'mimetype', '') <> v_media.mime_type then
    raise exception 'uploaded object metadata mismatch' using errcode = '22023';
  end if;

  update public.reservation_media
  set upload_status = 'ready', uploaded_at = now()
  where id = p_media_id
  returning * into v_media;
  return v_media;
end;
$$;

revoke all on function public.finalize_reservation_media_upload(uuid, text)
  from public, anon, authenticated;
grant execute on function public.finalize_reservation_media_upload(uuid, text)
  to service_role;

select public.materialize_reservation_checklist(id)
from public.reservations
where status in ('confirmed', 'in_progress');

commit;
