begin;

-- Commercial operations extend the existing reservation and scheduling model.
-- No existing reservation, segment, customer, or vehicle data is replaced.

alter table public.customers
  add column if not exists internal_notes text,
  add column if not exists anonymized_at timestamptz,
  add constraint customers_internal_notes_length
    check (internal_notes is null or char_length(internal_notes) <= 5000);

alter table public.vehicles
  add column if not exists registration_number text,
  add column if not exists normalized_registration text,
  add column if not exists applied_protection text,
  add column if not exists recommended_maintenance_date date,
  add column if not exists internal_notes text,
  add constraint vehicles_registration_length
    check (registration_number is null or char_length(registration_number) <= 32),
  add constraint vehicles_normalized_registration_length
    check (normalized_registration is null or char_length(normalized_registration) <= 32),
  add constraint vehicles_protection_length
    check (applied_protection is null or char_length(applied_protection) <= 500),
  add constraint vehicles_internal_notes_length
    check (internal_notes is null or char_length(internal_notes) <= 5000);

create index if not exists customers_normalized_phone_idx
  on public.customers (normalized_phone);
create index if not exists customers_normalized_email_idx
  on public.customers (normalized_email) where normalized_email <> '';
create index if not exists vehicles_normalized_registration_idx
  on public.vehicles (normalized_registration) where normalized_registration is not null;
create index if not exists vehicles_make_model_search_idx
  on public.vehicles (lower(make_model));

create table public.condition_levels (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  label_en text not null,
  label_lv text not null,
  label_ru text not null,
  explanation_en text not null default '',
  explanation_lv text not null default '',
  explanation_ru text not null default '',
  min_surcharge_cents integer not null default 0 check (min_surcharge_cents >= 0),
  max_surcharge_cents integer not null default 0 check (max_surcharge_cents >= min_surcharge_cents),
  min_duration_minutes integer not null default 0 check (min_duration_minutes >= 0),
  max_duration_minutes integer not null default 0 check (max_duration_minutes >= min_duration_minutes),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  requires_business_confirmation boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.condition_indicators (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  label_en text not null,
  label_lv text not null,
  label_ru text not null,
  explanation_en text not null default '',
  explanation_lv text not null default '',
  explanation_ru text not null default '',
  min_surcharge_cents integer not null default 0 check (min_surcharge_cents >= 0),
  max_surcharge_cents integer not null default 0 check (max_surcharge_cents >= min_surcharge_cents),
  min_duration_minutes integer not null default 0 check (min_duration_minutes >= 0),
  max_duration_minutes integer not null default 0 check (max_duration_minutes >= min_duration_minutes),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  requires_business_confirmation boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reservation_conditions (
  reservation_id uuid primary key references public.reservations(id) on delete cascade,
  condition_level_id uuid not null references public.condition_levels(id) on delete restrict,
  condition_code_snapshot text not null,
  condition_label_snapshot text not null,
  condition_min_surcharge_cents_snapshot integer not null check (condition_min_surcharge_cents_snapshot >= 0),
  condition_max_surcharge_cents_snapshot integer not null check (condition_max_surcharge_cents_snapshot >= condition_min_surcharge_cents_snapshot),
  condition_min_duration_minutes_snapshot integer not null check (condition_min_duration_minutes_snapshot >= 0),
  condition_max_duration_minutes_snapshot integer not null check (condition_max_duration_minutes_snapshot >= condition_min_duration_minutes_snapshot),
  indicator_snapshots jsonb not null default '[]'::jsonb check (jsonb_typeof(indicator_snapshots) = 'array'),
  total_min_surcharge_cents integer not null check (total_min_surcharge_cents >= 0),
  total_max_surcharge_cents integer not null check (total_max_surcharge_cents >= total_min_surcharge_cents),
  total_min_duration_minutes integer not null check (total_min_duration_minutes >= 0),
  total_max_duration_minutes integer not null check (total_max_duration_minutes >= total_min_duration_minutes),
  customer_notes text check (customer_notes is null or char_length(customer_notes) <= 1000),
  admin_notes text check (admin_notes is null or char_length(admin_notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reservations
  add column if not exists estimated_total_min_cents integer,
  add column if not exists estimated_total_max_cents integer,
  add column if not exists calculated_duration_min_minutes integer,
  add column if not exists calculated_duration_max_minutes integer,
  add column if not exists price_override_reason text,
  add column if not exists duration_override_reason text,
  add column if not exists checklist_override_reason text,
  add column if not exists checklist_override_by uuid references auth.users(id) on delete set null,
  add column if not exists checklist_override_at timestamptz;

update public.reservations
set estimated_total_min_cents = coalesce(estimated_total_min_cents, estimated_total_cents),
    estimated_total_max_cents = coalesce(estimated_total_max_cents, estimated_total_cents),
    calculated_duration_min_minutes = coalesce(calculated_duration_min_minutes, calculated_duration_minutes),
    calculated_duration_max_minutes = coalesce(calculated_duration_max_minutes, calculated_duration_minutes)
where estimated_total_min_cents is null
   or estimated_total_max_cents is null
   or (calculated_duration_minutes is not null and calculated_duration_min_minutes is null)
   or (calculated_duration_minutes is not null and calculated_duration_max_minutes is null);

alter table public.reservations
  add constraint reservations_estimate_range check (
    estimated_total_min_cents is null or (
      estimated_total_min_cents >= 0
      and estimated_total_max_cents >= estimated_total_min_cents
    )
  ),
  add constraint reservations_duration_range check (
    calculated_duration_min_minutes is null or (
      calculated_duration_min_minutes > 0
      and calculated_duration_max_minutes >= calculated_duration_min_minutes
    )
  ),
  add constraint reservations_override_reason_lengths check (
    (price_override_reason is null or char_length(price_override_reason) between 3 and 1000)
    and (duration_override_reason is null or char_length(duration_override_reason) between 3 and 1000)
    and (checklist_override_reason is null or char_length(checklist_override_reason) between 3 and 1000)
  );

create table public.reservation_media (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  storage_bucket text not null default 'reservation-media' check (storage_bucket = 'reservation-media'),
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  original_filename text not null check (char_length(original_filename) between 1 and 200),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  file_size integer not null check (file_size between 1 and 8388608),
  media_type text not null default 'reference' check (media_type in ('reference', 'before', 'after')),
  uploaded_by_type text not null check (uploaded_by_type in ('customer', 'admin')),
  uploaded_by uuid references auth.users(id) on delete set null,
  upload_status text not null default 'pending' check (upload_status in ('pending', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  uploaded_at timestamptz,
  deleted_at timestamptz,
  check ((uploaded_by_type = 'customer' and uploaded_by is null) or uploaded_by_type = 'admin')
);

create index reservation_media_reservation_idx
  on public.reservation_media (reservation_id, created_at) where deleted_at is null;
create index reservation_media_pending_idx
  on public.reservation_media (created_at) where upload_status = 'pending';

create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (char_length(name) between 2 and 100),
  description text not null default '' check (char_length(description) <= 500),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index checklist_templates_one_default_idx
  on public.checklist_templates (is_default) where is_default;

create table public.checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  label text not null check (char_length(label) between 2 and 200),
  is_required boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (template_id, sort_order)
);

create table public.service_checklist_templates (
  service_id uuid not null references public.services(id) on delete cascade,
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  primary key (service_id, template_id)
);

create table public.reservation_checklist_items (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  template_item_id uuid references public.checklist_template_items(id) on delete set null,
  label_snapshot text not null check (char_length(label_snapshot) between 2 and 200),
  is_required boolean not null default true,
  is_completed boolean not null default false,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  note text check (note is null or char_length(note) <= 1000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((is_completed and completed_at is not null) or (not is_completed and completed_at is null)),
  check (completed_by is null or is_completed)
);

create unique index reservation_checklist_template_item_idx
  on public.reservation_checklist_items (reservation_id, template_item_id)
  where template_item_id is not null;
create index reservation_checklist_progress_idx
  on public.reservation_checklist_items (reservation_id, is_completed, is_required);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  event_type text not null check (event_type in (
    'booking_requested', 'booking_confirmed', 'booking_rescheduled',
    'booking_reminder', 'booking_cancelled', 'vehicle_ready',
    'aftercare', 'review_request', 'scheduling_conflict',
    'pending_expiration', 'delivery_failure'
  )),
  audience text not null check (audience in ('customer', 'admin')),
  recipient text check (recipient is null or char_length(recipient) <= 254),
  language text not null check (language in ('en', 'lv', 'ru')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'suppressed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  provider text,
  provider_reference text,
  idempotency_key text not null unique check (char_length(idempotency_key) between 10 and 200),
  payload_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(payload_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);

create index notification_outbox_delivery_idx
  on public.notification_outbox (next_attempt_at, created_at)
  where status in ('pending', 'failed');
create index notification_outbox_reservation_idx
  on public.notification_outbox (reservation_id, created_at desc);

alter table public.services
  add column if not exists best_for_en text,
  add column if not exists best_for_lv text,
  add column if not exists best_for_ru text,
  add column if not exists included_work_en text[] not null default '{}',
  add column if not exists included_work_lv text[] not null default '{}',
  add column if not exists included_work_ru text[] not null default '{}',
  add column if not exists protection_duration_en text,
  add column if not exists protection_duration_lv text,
  add column if not exists protection_duration_ru text,
  add column if not exists recommended_condition_en text,
  add column if not exists recommended_condition_lv text,
  add column if not exists recommended_condition_ru text;

create table public.case_studies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title_en text not null,
  title_lv text not null,
  title_ru text not null,
  vehicle text not null check (char_length(vehicle) between 2 and 120),
  initial_condition_en text not null,
  initial_condition_lv text not null,
  initial_condition_ru text not null,
  work_performed_en text not null,
  work_performed_lv text not null,
  work_performed_ru text not null,
  service_duration_minutes integer check (service_duration_minutes is null or service_duration_minutes > 0),
  price_cents integer check (price_cents is null or price_cents >= 0),
  completion_date date,
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.case_study_media (
  id uuid primary key default gen_random_uuid(),
  case_study_id uuid not null references public.case_studies(id) on delete cascade,
  public_url text not null check (public_url ~ '^https://'),
  media_type text not null check (media_type in ('before', 'after')),
  alt_en text not null,
  alt_lv text not null,
  alt_ru text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index case_studies_public_idx
  on public.case_studies (sort_order, completion_date desc) where is_published;
create index case_study_media_case_idx
  on public.case_study_media (case_study_id, sort_order);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  customer_display_name text not null check (char_length(customer_display_name) between 1 and 100),
  rating smallint not null check (rating between 1 and 5),
  review_text text not null check (char_length(review_text) between 2 and 2000),
  source_name text not null check (char_length(source_name) between 2 and 80),
  source_url text not null check (source_url ~ '^https://'),
  review_date date not null,
  language text not null check (language in ('en', 'lv', 'ru')),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reviews_public_idx
  on public.reviews (review_date desc) where is_published;

create table public.business_configuration (
  singleton boolean primary key default true check (singleton),
  public_business_name text not null default 'VELORA Detail Lab',
  legal_entity_name text,
  registration_number text,
  address text,
  phone text,
  email text,
  instagram_url text,
  whatsapp_url text,
  map_url text,
  review_url text,
  timezone text not null default 'Europe/Riga' check (timezone = 'Europe/Riga'),
  privacy_contact text,
  reservation_retention_days integer check (reservation_retention_days is null or reservation_retention_days between 1 and 3650),
  cancellation_policy_en text,
  cancellation_policy_lv text,
  cancellation_policy_ru text,
  privacy_notice_en text,
  privacy_notice_lv text,
  privacy_notice_ru text,
  photo_processing_en text,
  photo_processing_lv text,
  photo_processing_ru text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (legal_entity_name is null or char_length(legal_entity_name) <= 200),
  check (registration_number is null or char_length(registration_number) <= 80),
  check (address is null or char_length(address) <= 500),
  check (phone is null or char_length(phone) <= 32),
  check (email is null or char_length(email) <= 254)
);

insert into public.business_configuration (singleton)
values (true)
on conflict (singleton) do nothing;

insert into public.condition_levels (
  code, label_en, label_lv, label_ru,
  explanation_en, explanation_lv, explanation_ru,
  min_surcharge_cents, max_surcharge_cents,
  min_duration_minutes, max_duration_minutes, sort_order
) values
  ('light', 'Light condition', 'Viegls stāvoklis', 'Лёгкое состояние',
   'Regularly maintained with light contamination.', 'Regulāri kopts ar viegliem netīrumiem.', 'Регулярно ухоженный автомобиль с лёгкими загрязнениями.',
   0, 0, 0, 0, 10),
  ('normal', 'Normal condition', 'Normāls stāvoklis', 'Обычное состояние',
   'Typical everyday use and moderate contamination.', 'Ikdienas lietojums un vidēji netīrumi.', 'Обычная эксплуатация и умеренные загрязнения.',
   0, 2000, 0, 60, 20),
  ('heavy', 'Heavy condition', 'Smags stāvoklis', 'Тяжёлое состояние',
   'Substantial contamination that needs additional work.', 'Būtiski netīrumi, kam nepieciešams papildu darbs.', 'Сильные загрязнения, требующие дополнительной работы.',
   3000, 9000, 60, 180, 30),
  ('assessment_required', 'Professional assessment required', 'Nepieciešams profesionāls novērtējums', 'Нужна профессиональная оценка',
   'Choose this when the condition cannot be estimated accurately from the form.', 'Izvēlieties, ja stāvokli nevar precīzi novērtēt anketā.', 'Выберите, если состояние невозможно точно оценить по форме.',
   0, 15000, 0, 240, 40)
on conflict (code) do nothing;

insert into public.condition_indicators (
  code, label_en, label_lv, label_ru,
  explanation_en, explanation_lv, explanation_ru,
  min_surcharge_cents, max_surcharge_cents,
  min_duration_minutes, max_duration_minutes, sort_order
) values
  ('pet_hair', 'Pet hair', 'Dzīvnieku spalvas', 'Шерсть животных', '', '', '', 1500, 4000, 30, 90, 10),
  ('heavy_stains', 'Heavy stains', 'Smagi traipi', 'Сильные пятна', '', '', '', 2000, 6000, 45, 120, 20),
  ('unpleasant_odour', 'Unpleasant odour', 'Nepatīkama smaka', 'Неприятный запах', '', '', '', 1500, 5000, 30, 120, 30),
  ('sand_or_mud', 'Excessive sand or mud', 'Pārmērīgas smiltis vai dubļi', 'Много песка или грязи', '', '', '', 1500, 4000, 30, 90, 40),
  ('tar_contamination', 'Tar contamination', 'Darvas piesārņojums', 'Битумные загрязнения', '', '', '', 1500, 5000, 30, 90, 50),
  ('wheel_contamination', 'Severe wheel contamination', 'Smags disku piesārņojums', 'Сильное загрязнение дисков', '', '', '', 1000, 3500, 20, 60, 60),
  ('visible_scratches', 'Visible scratches', 'Redzami skrāpējumi', 'Видимые царапины', '', '', '', 0, 8000, 30, 180, 70),
  ('other', 'Other condition', 'Cits stāvoklis', 'Другое состояние', '', '', '', 0, 8000, 0, 180, 80)
on conflict (code) do nothing;

insert into public.checklist_templates (code, name, description, is_default)
values
  ('standard', 'Standard detailing', 'Exterior and maintenance workflow.', true),
  ('interior', 'Interior detailing', 'Interior-specific inspection and delivery workflow.', false),
  ('paint_protection', 'Paint and protection', 'Paint correction and protection workflow.', false)
on conflict (code) do nothing;

insert into public.checklist_template_items (template_id, label, is_required, sort_order)
select t.id, item.label, item.required, item.sort_order
from public.checklist_templates t
join (values
  ('standard', 'Initial vehicle inspection', true, 10),
  ('standard', 'Customer damage documented', true, 20),
  ('standard', 'Before photographs taken', true, 30),
  ('standard', 'Safe wash completed', true, 40),
  ('standard', 'Decontamination completed', true, 50),
  ('standard', 'Selected detailing work completed', true, 60),
  ('standard', 'Final inspection completed', true, 70),
  ('standard', 'After photographs taken', true, 80),
  ('standard', 'Customer notified', true, 90),
  ('interior', 'Initial vehicle inspection', true, 10),
  ('interior', 'Customer damage documented', true, 20),
  ('interior', 'Before photographs taken', true, 30),
  ('interior', 'Interior detailing work completed', true, 40),
  ('interior', 'Final inspection completed', true, 50),
  ('interior', 'After photographs taken', true, 60),
  ('interior', 'Customer notified', true, 70),
  ('paint_protection', 'Initial vehicle inspection', true, 10),
  ('paint_protection', 'Customer damage documented', true, 20),
  ('paint_protection', 'Before photographs taken', true, 30),
  ('paint_protection', 'Safe wash completed', true, 40),
  ('paint_protection', 'Decontamination completed', true, 50),
  ('paint_protection', 'Paint preparation completed', true, 60),
  ('paint_protection', 'Selected detailing work completed', true, 70),
  ('paint_protection', 'Protection applied', true, 80),
  ('paint_protection', 'Final inspection completed', true, 90),
  ('paint_protection', 'After photographs taken', true, 100),
  ('paint_protection', 'Customer notified', true, 110)
) as item(template_code, label, required, sort_order)
  on item.template_code = t.code
on conflict (template_id, sort_order) do nothing;

insert into public.service_checklist_templates (service_id, template_id)
select s.id, t.id
from public.services s
join public.checklist_templates t on t.code = case
  when s.code = 'interior' then 'interior'
  when s.code in ('correction', 'ceramic', 'ppfFront', 'ppfFull') then 'paint_protection'
  else 'standard'
end
on conflict do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reservation-media', 'reservation-media', false, 8388608,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.materialize_reservation_checklist(p_reservation_id uuid)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  insert into public.reservation_checklist_items (
    reservation_id, template_item_id, label_snapshot, is_required, sort_order
  )
  select distinct on (item.label)
    p_reservation_id, item.id, item.label, item.is_required, item.sort_order
  from public.reservation_services selected
  join public.service_checklist_templates link on link.service_id = selected.service_id
  join public.checklist_templates template on template.id = link.template_id and template.is_active
  join public.checklist_template_items item on item.template_id = template.id
  where selected.reservation_id = p_reservation_id
  order by item.label, item.sort_order
  on conflict (reservation_id, template_item_id) where template_item_id is not null do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.reservation_status_operations_trigger()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'confirmed' and old.status is distinct from new.status then
    perform public.materialize_reservation_checklist(new.id);
    insert into public.notification_outbox (
      reservation_id, event_type, audience, recipient, language, idempotency_key
    ) values
      (new.id, 'booking_confirmed', 'customer', null, new.language, new.id::text || ':booking_confirmed:customer'),
      (new.id, 'booking_confirmed', 'admin', null, 'en', new.id::text || ':booking_confirmed:admin')
    on conflict (idempotency_key) do nothing;
  end if;

  if new.status = 'completed' and old.status is distinct from new.status then
    if exists (
      select 1 from public.reservation_checklist_items
      where reservation_id = new.id and is_required and not is_completed
    ) and nullif(trim(new.checklist_override_reason), '') is null then
      raise exception 'CHECKLIST_INCOMPLETE' using errcode = 'P0001';
    end if;
    new.completed_at := coalesce(new.completed_at, now());
    insert into public.notification_outbox (
      reservation_id, event_type, audience, recipient, language, idempotency_key
    ) values
      (new.id, 'vehicle_ready', 'customer', null, new.language, new.id::text || ':vehicle_ready:customer'),
      (new.id, 'aftercare', 'customer', null, new.language, new.id::text || ':aftercare:customer'),
      (new.id, 'review_request', 'customer', null, new.language, new.id::text || ':review_request:customer')
    on conflict (idempotency_key) do nothing;
  end if;

  if new.status = 'cancelled' and old.status is distinct from new.status then
    insert into public.notification_outbox (
      reservation_id, event_type, audience, recipient, language, idempotency_key
    ) values
      (new.id, 'booking_cancelled', 'customer', null, new.language, new.id::text || ':booking_cancelled:customer'),
      (new.id, 'booking_cancelled', 'admin', null, 'en', new.id::text || ':booking_cancelled:admin')
    on conflict (idempotency_key) do nothing;
  end if;

  if new.starts_at is distinct from old.starts_at and old.starts_at is not null then
    insert into public.notification_outbox (
      reservation_id, event_type, audience, recipient, language, idempotency_key
    ) values (
      new.id, 'booking_rescheduled', 'customer', null, new.language,
      new.id::text || ':booking_rescheduled:customer:' || extract(epoch from new.starts_at)::bigint::text
    ) on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists reservation_status_operations on public.reservations;
create trigger reservation_status_operations
  before update on public.reservations
  for each row execute function public.reservation_status_operations_trigger();

create or replace function public.create_scheduled_reservation_transactional_v3(
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
  v_result record;
  v_min_price integer;
  v_max_price integer;
  v_min_duration integer;
  v_max_duration integer;
begin
  if jsonb_typeof(p_condition_snapshot) <> 'object'
    or nullif(p_condition_snapshot->>'level_id', '') is null
    or jsonb_typeof(coalesce(p_condition_snapshot->'indicators', '[]'::jsonb)) <> 'array' then
    raise exception 'invalid condition snapshot' using errcode = '22023';
  end if;

  v_min_price := (p_condition_snapshot->>'total_min_surcharge_cents')::integer;
  v_max_price := (p_condition_snapshot->>'total_max_surcharge_cents')::integer;
  v_min_duration := (p_condition_snapshot->>'total_min_duration_minutes')::integer;
  v_max_duration := (p_condition_snapshot->>'total_max_duration_minutes')::integer;
  if v_min_price < 0 or v_max_price < v_min_price or v_min_duration < 0 or v_max_duration < v_min_duration then
    raise exception 'invalid condition totals' using errcode = '22023';
  end if;

  select * into v_result
  from public.create_scheduled_reservation_transactional_v2(
    p_reference, p_full_name, p_phone, p_email, p_vehicle_category_id,
    p_vehicle_description, p_requested_start, p_estimated_total_cents,
    p_calculated_duration_minutes, p_language, p_customer_message,
    p_idempotency_key, p_vehicle_snapshot, p_service_snapshots, p_package_snapshot
  );

  if not v_result.was_existing then
    insert into public.reservation_conditions (
      reservation_id, condition_level_id, condition_code_snapshot,
      condition_label_snapshot, condition_min_surcharge_cents_snapshot,
      condition_max_surcharge_cents_snapshot, condition_min_duration_minutes_snapshot,
      condition_max_duration_minutes_snapshot, indicator_snapshots,
      total_min_surcharge_cents, total_max_surcharge_cents,
      total_min_duration_minutes, total_max_duration_minutes, customer_notes
    ) values (
      v_result.reservation_id, (p_condition_snapshot->>'level_id')::uuid,
      p_condition_snapshot->>'level_code', p_condition_snapshot->>'level_label',
      (p_condition_snapshot->>'level_min_surcharge_cents')::integer,
      (p_condition_snapshot->>'level_max_surcharge_cents')::integer,
      (p_condition_snapshot->>'level_min_duration_minutes')::integer,
      (p_condition_snapshot->>'level_max_duration_minutes')::integer,
      coalesce(p_condition_snapshot->'indicators', '[]'::jsonb),
      v_min_price, v_max_price, v_min_duration, v_max_duration,
      nullif(p_condition_snapshot->>'customer_notes', '')
    );

    update public.reservations
    set estimated_total_min_cents = p_estimated_total_cents,
        estimated_total_max_cents = p_estimated_total_cents + (v_max_price - v_min_price),
        calculated_duration_min_minutes = p_calculated_duration_minutes - (v_max_duration - v_min_duration),
        calculated_duration_max_minutes = p_calculated_duration_minutes
    where id = v_result.reservation_id;

    insert into public.notification_outbox (
      reservation_id, event_type, audience, recipient, language, idempotency_key
    ) values
      (v_result.reservation_id, 'booking_requested', 'customer', null, p_language,
       v_result.reservation_id::text || ':booking_requested:customer'),
      (v_result.reservation_id, 'booking_requested', 'admin', null, 'en',
       v_result.reservation_id::text || ':booking_requested:admin')
    on conflict (idempotency_key) do nothing;
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

revoke all on function public.create_scheduled_reservation_transactional_v3(
  text, text, text, text, uuid, text, timestamptz, integer, integer, text,
  text, uuid, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.create_scheduled_reservation_transactional_v3(
  text, text, text, text, uuid, text, timestamptz, integer, integer, text,
  text, uuid, jsonb, jsonb, jsonb, jsonb
) to service_role;

create or replace function public.complete_checklist_item(
  p_actor uuid,
  p_item_id uuid,
  p_completed boolean,
  p_note text default null
)
returns public.reservation_checklist_items
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_item public.reservation_checklist_items%rowtype;
begin
  perform public.assert_active_admin(p_actor);
  update public.reservation_checklist_items
  set is_completed = p_completed,
      completed_by = case when p_completed then p_actor else null end,
      completed_at = case when p_completed then now() else null end,
      note = nullif(trim(coalesce(p_note, '')), ''),
      updated_at = now()
  where id = p_item_id
  returning * into v_item;
  if not found then raise exception 'checklist item not found' using errcode = 'P0002'; end if;

  insert into public.reservation_history (reservation_id, changed_by, action, new_value)
  values (v_item.reservation_id, p_actor, 'checklist_item_updated', jsonb_build_object(
    'item_id', v_item.id, 'label', v_item.label_snapshot,
    'completed', v_item.is_completed, 'note', v_item.note
  ));
  return v_item;
end;
$$;

revoke all on function public.complete_checklist_item(uuid, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.complete_checklist_item(uuid, uuid, boolean, text)
  to service_role;

-- Materialize checklists for existing confirmed and active work without changing status.
select public.materialize_reservation_checklist(id)
from public.reservations
where status in ('confirmed', 'in_progress');

-- Maintain timestamps consistently with the rest of the schema.
create trigger condition_levels_updated_at before update on public.condition_levels
  for each row execute function public.set_updated_at();
create trigger condition_indicators_updated_at before update on public.condition_indicators
  for each row execute function public.set_updated_at();
create trigger reservation_conditions_updated_at before update on public.reservation_conditions
  for each row execute function public.set_updated_at();
create trigger checklist_templates_updated_at before update on public.checklist_templates
  for each row execute function public.set_updated_at();
create trigger reservation_checklist_items_updated_at before update on public.reservation_checklist_items
  for each row execute function public.set_updated_at();
create trigger notification_outbox_updated_at before update on public.notification_outbox
  for each row execute function public.set_updated_at();
create trigger case_studies_updated_at before update on public.case_studies
  for each row execute function public.set_updated_at();
create trigger reviews_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();
create trigger business_configuration_updated_at before update on public.business_configuration
  for each row execute function public.set_updated_at();

-- All exposed operational tables use RLS. Browser clients receive no direct data
-- access; authenticated admin requests are authorised by Netlify Functions.
alter table public.condition_levels enable row level security;
alter table public.condition_indicators enable row level security;
alter table public.reservation_conditions enable row level security;
alter table public.reservation_media enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.checklist_template_items enable row level security;
alter table public.service_checklist_templates enable row level security;
alter table public.reservation_checklist_items enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.case_studies enable row level security;
alter table public.case_study_media enable row level security;
alter table public.reviews enable row level security;
alter table public.business_configuration enable row level security;

revoke all on public.condition_levels, public.condition_indicators,
  public.reservation_conditions, public.reservation_media,
  public.checklist_templates, public.checklist_template_items,
  public.service_checklist_templates, public.reservation_checklist_items,
  public.notification_outbox, public.case_studies, public.case_study_media,
  public.reviews, public.business_configuration from anon, authenticated;

grant all on public.condition_levels, public.condition_indicators,
  public.reservation_conditions, public.reservation_media,
  public.checklist_templates, public.checklist_template_items,
  public.service_checklist_templates, public.reservation_checklist_items,
  public.notification_outbox, public.case_studies, public.case_study_media,
  public.reviews, public.business_configuration to service_role;

commit;
