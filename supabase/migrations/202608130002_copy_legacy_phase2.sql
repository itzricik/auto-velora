begin;

do $$
declare
  legacy_booking_count integer;
  migrated_booking_count integer;
  legacy_item_count integer;
  migrated_item_count integer;
  legacy_history_count integer;
  migrated_history_count integer;
begin
  if to_regclass('velora_legacy.bookings') is null then
    return;
  end if;

  insert into public.vehicle_categories (
    id, code, name_en, name_lv, name_ru, price_multiplier,
    duration_multiplier, is_active, sort_order, created_at, updated_at
  )
  select
    id, code, name_en, name_lv, name_ru, price_multiplier,
    duration_multiplier, is_active, sort_order, created_at, updated_at
  from velora_legacy.vehicle_categories
  on conflict (id) do nothing;

  insert into public.services (
    id, code, name_en, name_lv, name_ru, description_en, description_lv,
    description_ru, base_price_cents, base_duration_minutes, is_active,
    sort_order, created_at, updated_at
  )
  select
    id, code, name_en, name_lv, name_ru, description_en, description_lv,
    description_ru, base_price_cents, base_duration_minutes, is_active,
    sort_order, created_at, updated_at
  from velora_legacy.services
  on conflict (id) do nothing;

  insert into public.service_packages (
    id, code, name_en, name_lv, name_ru, description_en, description_lv,
    description_ru, package_price_cents, base_duration_minutes, is_active,
    sort_order, created_at, updated_at
  )
  select
    id, code, name_en, name_lv, name_ru, description_en, description_lv,
    description_ru, package_price_cents, base_duration_minutes, is_active,
    sort_order, created_at, updated_at
  from velora_legacy.service_packages
  on conflict (id) do nothing;

  insert into public.package_services (package_id, service_id, sort_order)
  select package_id, service_id, sort_order
  from velora_legacy.package_services
  on conflict (package_id, service_id) do nothing;

  insert into public.work_bays (id, code, name, is_active, created_at, updated_at)
  select id, code, name, is_active, created_at, updated_at
  from velora_legacy.work_bays
  on conflict (id) do nothing;

  insert into public.business_hours (
    weekday, opens_at, closes_at, is_closed, effective_from, updated_at
  )
  select distinct on (weekday)
    weekday, opens_at, closes_at, is_closed, effective_from, updated_at
  from velora_legacy.business_hours
  order by weekday, effective_from desc nulls last, updated_at desc
  on conflict (weekday) do nothing;

  insert into public.admin_profiles (
    user_id, role, display_name, is_active, created_at, updated_at
  )
  select user_id, role, display_name, is_active, created_at, updated_at
  from velora_legacy.admin_profiles
  on conflict (user_id) do nothing;

  insert into public.blocked_periods (
    id, work_bay_id, starts_at, ends_at, reason, created_by, created_at
  )
  select id, work_bay_id, starts_at, ends_at, reason, created_by, created_at
  from velora_legacy.blocked_periods
  on conflict (id) do nothing;

  insert into public.customers (
    id, full_name, normalized_email, normalized_phone, created_at, updated_at
  )
  select id, full_name, normalized_email, normalized_phone, created_at, updated_at
  from velora_legacy.customers
  on conflict (id) do nothing;

  insert into public.vehicles (
    id, customer_id, make_model, vehicle_category_id, created_at, updated_at
  )
  select
    booking.id, booking.customer_id, booking.vehicle_description,
    booking.vehicle_category_id, booking.created_at, booking.updated_at
  from velora_legacy.bookings booking
  on conflict (id) do nothing;

  insert into public.booking_requests (
    id, reference, public_access_token_hash, customer_id, vehicle_id,
    work_bay_id, starts_at, ends_at, preferred_date, status,
    vehicle_make_model_snapshot, vehicle_type_code_snapshot,
    vehicle_type_name_snapshot, vehicle_multiplier_snapshot,
    base_price_cents_snapshot, estimated_price_cents,
    estimated_duration_minutes, final_price_cents, currency,
    pricing_version, booking_language, customer_notes, internal_notes,
    consent_timestamp, consent_policy_version, idempotency_key,
    created_at, updated_at, confirmed_at, cancelled_at, completed_at
  )
  select
    booking.id,
    booking.reference,
    booking.public_access_token_hash,
    booking.customer_id,
    booking.id,
    booking.work_bay_id,
    booking.starts_at,
    booking.ends_at,
    (booking.starts_at at time zone 'Europe/Riga')::date,
    case booking.status::text
      when 'requested' then 'new'
      when 'rejected' then 'cancelled'
      else booking.status::text
    end::public.booking_status,
    booking.vehicle_description,
    category.code,
    category.name_en,
    category.price_multiplier,
    booking.estimated_price_cents,
    booking.estimated_price_cents,
    booking.estimated_duration_minutes,
    booking.final_price_cents,
    booking.currency,
    booking.pricing_version,
    booking.booking_language,
    booking.customer_notes,
    booking.internal_notes,
    booking.consent_timestamp,
    booking.consent_policy_version,
    booking.idempotency_key,
    booking.created_at,
    booking.updated_at,
    booking.confirmed_at,
    booking.cancelled_at,
    booking.completed_at
  from velora_legacy.bookings booking
  join velora_legacy.vehicle_categories category
    on category.id = booking.vehicle_category_id
  on conflict (id) do nothing;

  insert into public.booking_items (
    booking_request_id, service_id, service_code_snapshot,
    service_name_snapshot, base_price_cents_snapshot,
    vehicle_multiplier_snapshot, calculated_price_cents_snapshot,
    duration_minutes_snapshot, quantity, created_at
  )
  select
    item.booking_id,
    item.service_id,
    service.code,
    item.service_name_snapshot,
    service.base_price_cents,
    category.price_multiplier,
    item.unit_price_cents_snapshot,
    item.duration_minutes_snapshot,
    item.quantity,
    item.created_at
  from velora_legacy.booking_services item
  join velora_legacy.bookings booking on booking.id = item.booking_id
  join velora_legacy.services service on service.id = item.service_id
  join velora_legacy.vehicle_categories category
    on category.id = booking.vehicle_category_id
  on conflict (booking_request_id, service_id) do nothing;

  insert into public.booking_history (
    id, booking_request_id, previous_status, new_status, changed_by,
    change_source, note, created_at
  )
  select
    history.id,
    history.booking_id,
    case history.previous_status::text
      when 'requested' then 'new'
      when 'rejected' then 'cancelled'
      else history.previous_status::text
    end::public.booking_status,
    case history.new_status::text
      when 'requested' then 'new'
      when 'rejected' then 'cancelled'
      else history.new_status::text
    end::public.booking_status,
    history.changed_by,
    case when history.change_source = 'customer' then 'system'
      else history.change_source end,
    history.note,
    history.created_at
  from velora_legacy.booking_status_history history
  on conflict (id) do nothing;

  insert into public.notification_logs (
    id, booking_request_id, notification_type, recipient, provider,
    provider_message_id, status, error_message, created_at, sent_at
  )
  select
    log.id, log.booking_id, log.notification_type, log.recipient, log.provider,
    log.provider_message_id, log.status::text::public.notification_status,
    log.error_message, log.created_at, log.sent_at
  from velora_legacy.notification_logs log
  on conflict (id) do nothing;

  select count(*) into legacy_booking_count from velora_legacy.bookings;
  select count(*) into migrated_booking_count from public.booking_requests;
  select count(*) into legacy_item_count from velora_legacy.booking_services;
  select count(*) into migrated_item_count from public.booking_items;
  select count(*) into legacy_history_count from velora_legacy.booking_status_history;
  select count(*) into migrated_history_count from public.booking_history;

  if migrated_booking_count < legacy_booking_count
    or migrated_item_count < legacy_item_count
    or migrated_history_count < legacy_history_count then
    raise exception 'legacy booking migration row-count verification failed';
  end if;
end;
$$;

drop schema if exists velora_legacy cascade;

commit;
