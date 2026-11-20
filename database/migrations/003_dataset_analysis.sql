alter table projects add column if not exists overlap_analysis jsonb;
create unique index if not exists project_images_project_sha_idx on project_images (project_id, sha256);
