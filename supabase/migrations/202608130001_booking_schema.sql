begin;

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create type public.booking_status as enum (
  'new',
  'contacted',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'no_show'
);

create type public.notification_status as enum ('pending', 'sent', 'failed');

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.vehicle_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_en text not null,
  name_lv text not null,
  name_ru text not null,
  price_multiplier numeric(6, 3) not null check (price_multiplier > 0),
  duration_multiplier numeric(6, 3) not null check (duration_multiplier > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-zA-Z0-9_]*$'),
  name_en text not null,
  name_lv text not null,
  name_ru text not null,
  description_en text not null,
  description_lv text not null,
  description_ru text not null,
  base_price_cents integer not null check (base_price_cents >= 0),
  base_duration_minutes integer not null check (base_duration_minutes > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_packages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_en text not null,
  name_lv text not null,
  name_ru text not null,
  description_en text not null,
  description_lv text not null,
  description_ru text not null,
  package_price_cents integer not null check (package_price_cents >= 0),
  base_duration_minutes integer not null check (base_duration_minutes > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.package_services (
  package_id uuid not null references public.service_packages(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  sort_order integer not null default 0,
  primary key (package_id, service_id)
);

create table public.work_bays (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_hours (
  weekday smallint primary key check (weekday between 0 and 6),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  effective_from date,
  updated_at timestamptz not null default now(),
  check (is_closed or (opens_at is not null and closes_at is not null and closes_at > opens_at))
);

create table public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'staff')),
  display_name text not null check (char_length(display_name) between 2 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.blocked_periods (
  id uuid primary key default gen_random_uuid(),
  work_bay_id uuid references public.work_bays(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null check (char_length(reason) between 1 and 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 2 and 100),
  normalized_email text not null check (char_length(normalized_email) <= 254),
  normalized_phone text not null check (char_length(normalized_phone) <= 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_email, normalized_phone)
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  make_model text not null check (char_length(make_model) between 2 and 120),
  vehicle_category_id uuid not null references public.vehicle_categories(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^VEL-[0-9]{4}-[A-Z0-9]{8}$'),
  public_access_token_hash text not null check (char_length(public_access_token_hash) = 64),
  customer_id uuid not null references public.customers(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  work_bay_id uuid not null references public.work_bays(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  preferred_date date not null,
  status public.booking_status not null default 'new',
  vehicle_make_model_snapshot text not null,
  vehicle_type_code_snapshot text not null,
  vehicle_type_name_snapshot text not null,
  vehicle_multiplier_snapshot numeric(6, 3) not null check (vehicle_multiplier_snapshot > 0),
  base_price_cents_snapshot integer not null check (base_price_cents_snapshot >= 0),
  estimated_price_cents integer not null check (estimated_price_cents >= 0),
  estimated_duration_minutes integer not null check (estimated_duration_minutes > 0),
  final_price_cents integer check (final_price_cents is null or final_price_cents >= 0),
  currency char(3) not null default 'EUR' check (currency = 'EUR'),
  pricing_version text not null,
  booking_language text not null check (booking_language in ('en', 'lv', 'ru')),
  customer_notes text check (customer_notes is null or char_length(customer_notes) <= 1500),
  internal_notes text check (internal_notes is null or char_length(internal_notes) <= 5000),
  consent_timestamp timestamptz not null,
  consent_policy_version text not null check (char_length(consent_policy_version) <= 100),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  contacted_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  check (ends_at > starts_at)
);

alter table public.booking_requests
  add constraint booking_requests_no_overlapping_active
  exclude using gist (
    work_bay_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status in ('confirmed', 'in_progress'));

create table public.booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null references public.booking_requests(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  service_code_snapshot text not null,
  service_name_snapshot text not null,
  base_price_cents_snapshot integer not null check (base_price_cents_snapshot >= 0),
  vehicle_multiplier_snapshot numeric(6, 3) not null check (vehicle_multiplier_snapshot > 0),
  calculated_price_cents_snapshot integer not null check (calculated_price_cents_snapshot >= 0),
  duration_minutes_snapshot integer not null check (duration_minutes_snapshot > 0),
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (booking_request_id, service_id)
);

create table public.booking_history (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null references public.booking_requests(id) on delete cascade,
  previous_status public.booking_status,
  new_status public.booking_status not null,
  changed_by uuid references auth.users(id) on delete set null,
  change_source text not null check (change_source in ('public_api', 'admin', 'system')),
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null references public.booking_requests(id) on delete cascade,
  notification_type text not null,
  recipient text not null,
  provider text not null,
  provider_message_id text,
  status public.notification_status not null default 'pending',
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table public.api_rate_limits (
  id uuid primary key default gen_random_uuid(),
  identifier_hash text not null check (char_length(identifier_hash) = 64),
  scope text not null check (char_length(scope) between 1 and 50),
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (identifier_hash, scope, window_start)
);

create index booking_requests_starts_at_idx on public.booking_requests (starts_at);
create index booking_requests_status_date_idx on public.booking_requests (status, preferred_date);
create index booking_history_request_created_idx on public.booking_history (booking_request_id, created_at);
create index vehicles_customer_idx on public.vehicles (customer_id);
create index blocked_periods_range_idx on public.blocked_periods using gist (tstzrange(starts_at, ends_at, '[)'));
create index rate_limits_expiry_idx on public.api_rate_limits (expires_at);

create trigger vehicle_categories_updated_at before update on public.vehicle_categories for each row execute function public.set_updated_at();
create trigger services_updated_at before update on public.services for each row execute function public.set_updated_at();
create trigger service_packages_updated_at before update on public.service_packages for each row execute function public.set_updated_at();
create trigger work_bays_updated_at before update on public.work_bays for each row execute function public.set_updated_at();
create trigger admin_profiles_updated_at before update on public.admin_profiles for each row execute function public.set_updated_at();
create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger vehicles_updated_at before update on public.vehicles for each row execute function public.set_updated_at();
create trigger booking_requests_updated_at before update on public.booking_requests for each row execute function public.set_updated_at();
create trigger api_rate_limits_updated_at before update on public.api_rate_limits for each row execute function public.set_updated_at();

alter table public.vehicle_categories enable row level security;
alter table public.services enable row level security;
alter table public.service_packages enable row level security;
alter table public.package_services enable row level security;
alter table public.work_bays enable row level security;
alter table public.business_hours enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.blocked_periods enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.booking_requests enable row level security;
alter table public.booking_items enable row level security;
alter table public.booking_history enable row level security;
alter table public.notification_logs enable row level security;
alter table public.api_rate_limits enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- No public table policies are created. Browser clients can use Supabase Auth,
-- but all customer and booking data is available only to server-side functions.

commit;
