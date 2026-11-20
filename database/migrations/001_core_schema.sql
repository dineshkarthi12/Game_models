-- Vistora 3D core schema. Compatible with plain PostgreSQL 15+ and Supabase.
create extension if not exists pgcrypto;

-- Role used by the API for user-scoped requests (RLS applies to it).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'vistora_app') then create role vistora_app nologin; end if;
  execute format('grant vistora_app to %I', current_user);
exception when insufficient_privilege then raise notice 'could not grant vistora_app to current user';
end $$;

-- Current user resolution: API session setting first, then Supabase auth.uid() when present.
create or replace function public.app_current_user_id() returns uuid
language plpgsql stable as $$
declare v text;
begin
  v := nullif(current_setting('app.current_user_id', true), '');
  if v is not null then return v::uuid; end if;
  if to_regprocedure('auth.uid()') is not null then
    execute 'select auth.uid()::text' into v;
    return nullif(v, '')::uuid;
  end if;
  return null;
end $$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ───────────────────────── identity ─────────────────────────
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text,
  auth_provider text not null default 'local' check (auth_provider in ('local','supabase')),
  email_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index users_email_lower_idx on users (lower(email));

create table profiles (
  user_id uuid primary key references users(id) on delete cascade,
  full_name text,
  avatar_url text,
  company text,
  job_title text,
  preferences jsonb not null default '{}'::jsonb,
  plan text not null default 'free' check (plan in ('free','pro','studio')),
  storage_used_bytes bigint not null default 0,
  storage_quota_bytes bigint not null default 2147483648,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  user_agent text,
  ip text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index sessions_user_idx on sessions (user_id, created_at desc);

create table password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ───────────────────────── teams ─────────────────────────
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('owner','admin','member')),
  status text not null default 'invited' check (status in ('active','invited')),
  invited_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (team_id, email)
);
create index team_members_user_idx on team_members (user_id) where user_id is not null;

-- ───────────────────────── projects & images ─────────────────────────
create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  team_id uuid references teams(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  category text not null default 'custom',
  status text not null default 'draft' check (status in ('draft','processing','completed','failed')),
  cover_image_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner_idx on projects (owner_id, updated_at desc);
create index projects_team_idx on projects (team_id) where team_id is not null;
create trigger projects_touch before update on projects for each row execute function touch_updated_at();

create table project_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  owner_id uuid not null references users(id) on delete cascade,
  storage_key text not null,
  thumb_key text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  width int not null,
  height int not null,
  sha256 text not null,
  dhash text not null,
  angle text not null default 'custom',
  custom_label text,
  sort_order int not null default 0,
  quality jsonb,
  created_at timestamptz not null default now()
);
create index project_images_project_idx on project_images (project_id, sort_order);

-- ───────────────────────── generations ─────────────────────────
create table generations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  mode text not null check (mode in ('ai','photogrammetry')),
  provider text not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  stage text,
  progress numeric(5,2),
  progress_source text,
  settings jsonb not null default '{}'::jsonb,
  input_image_ids uuid[] not null default '{}',
  used_image_ids uuid[] not null default '{}',
  error text,
  model_id uuid,
  credits_charged int not null default 0,
  is_demo boolean not null default false,
  metrics jsonb not null default '{}'::jsonb,
  events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index generations_owner_idx on generations (owner_id, created_at desc);
create index generations_project_idx on generations (project_id, created_at desc);
create index generations_status_idx on generations (status) where status in ('queued','running');

create table generation_jobs (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references generations(id) on delete cascade,
  owner_id uuid not null references users(id) on delete cascade,
  provider text not null,
  kind text not null default 'generate',
  provider_task_id text,
  status text not null default 'queued',
  request jsonb,
  response jsonb,
  attempts int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index generation_jobs_generation_idx on generation_jobs (generation_id);
create index generation_jobs_task_idx on generation_jobs (provider, provider_task_id);
create trigger generation_jobs_touch before update on generation_jobs for each row execute function touch_updated_at();

create table reconstruction_jobs (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null unique references generations(id) on delete cascade,
  owner_id uuid not null references users(id) on delete cascade,
  status text not null default 'queued',
  stage text,
  colmap_version text,
  dense_mode text,
  total_images int,
  registered_images int,
  sparse_points int,
  mean_reprojection_error double precision,
  mean_track_length double precision,
  mesh_vertices int,
  mesh_faces int,
  scale_factor double precision,
  scale_source text,
  log_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger reconstruction_jobs_touch before update on reconstruction_jobs for each row execute function touch_updated_at();

-- ───────────────────────── models ─────────────────────────
create table asset_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table models (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  generation_id uuid references generations(id) on delete set null,
  name text not null,
  category text not null default 'custom',
  source text not null check (source in ('ai','photogrammetry','upload')),
  provider text,
  is_demo boolean not null default false,
  status text not null default 'processing' check (status in ('processing','ready','failed')),
  current_version_id uuid,
  favorite boolean not null default false,
  folder_id uuid references asset_folders(id) on delete set null,
  game_ready boolean not null default false,
  thumbnail_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index models_owner_idx on models (owner_id, created_at desc);
create index models_project_idx on models (project_id);
create trigger models_touch before update on models for each row execute function touch_updated_at();
alter table generations add constraint generations_model_fk foreign key (model_id) references models(id) on delete set null;

create table model_versions (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id) on delete cascade,
  owner_id uuid not null references users(id) on delete cascade,
  version int not null,
  label text not null,
  operation text not null,
  parent_version_id uuid references model_versions(id) on delete set null,
  params jsonb not null default '{}'::jsonb,
  storage_key text not null,
  file_size bigint not null,
  is_lod boolean not null default false,
  lod_level int,
  created_at timestamptz not null default now(),
  unique (model_id, version)
);
alter table models add constraint models_current_version_fk foreign key (current_version_id) references model_versions(id) on delete set null;

create table model_textures (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references model_versions(id) on delete cascade,
  owner_id uuid not null references users(id) on delete cascade,
  name text not null,
  map_type text,
  width int,
  height int,
  mime_type text,
  storage_key text,
  created_at timestamptz not null default now()
);
create index model_textures_version_idx on model_textures (version_id);

create table model_metadata (
  version_id uuid primary key references model_versions(id) on delete cascade,
  owner_id uuid not null references users(id) on delete cascade,
  stats jsonb not null,
  analyzed_at timestamptz not null default now()
);

create table asset_tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  model_id uuid not null references models(id) on delete cascade,
  tag text not null check (char_length(tag) between 1 and 40),
  unique (model_id, tag)
);
create index asset_tags_owner_tag_idx on asset_tags (owner_id, tag);

create table validation_reports (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id) on delete cascade,
  version_id uuid not null references model_versions(id) on delete cascade,
  owner_id uuid not null references users(id) on delete cascade,
  report jsonb not null,
  created_at timestamptz not null default now()
);
create index validation_reports_model_idx on validation_reports (model_id, created_at desc);

create table processing_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  model_id uuid not null references models(id) on delete cascade,
  version_id uuid references model_versions(id) on delete cascade,
  kind text not null check (kind in ('analyze','validate','refine','optimize','lod')),
  status text not null default 'queued',
  params jsonb not null default '{}'::jsonb,
  result_version_id uuid references model_versions(id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index processing_jobs_model_idx on processing_jobs (model_id, created_at desc);

create table export_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  model_id uuid not null references models(id) on delete cascade,
  version_id uuid not null references model_versions(id) on delete cascade,
  preset text not null,
  formats text[] not null,
  settings jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  stage text,
  error text,
  files jsonb not null default '[]'::jsonb,
  package_key text,
  package_size bigint,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index export_jobs_owner_idx on export_jobs (owner_id, created_at desc);

-- ───────────────────────── billing ─────────────────────────
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','pro','studio')),
  status text not null default 'active',
  provider text,
  provider_ref text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  amount int not null check (amount <> 0),
  reason text not null,
  reference_type text,
  reference_id uuid,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index credit_transactions_user_idx on credit_transactions (user_id, created_at desc);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);
