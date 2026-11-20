alter table reconstruction_jobs add column if not exists point_cloud_key text;
alter table reconstruction_jobs add column if not exists cameras_key text;
alter table reconstruction_jobs add column if not exists metrics jsonb not null default '{}'::jsonb;
alter table reconstruction_jobs add column if not exists model_id uuid references models(id) on delete set null;
