-- Row Level Security. Table owners bypass RLS (system/worker context); every other role,
-- including vistora_app (API user context) and Supabase's `authenticated`, is restricted.

create or replace function public.app_is_team_member(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members m where m.team_id = p_team and m.user_id = app_current_user_id() and m.status = 'active')
      or exists (select 1 from teams t where t.id = p_team and t.owner_id = app_current_user_id());
$$;

create or replace function public.app_can_access_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects p where p.id = p_project
      and (p.owner_id = app_current_user_id() or (p.team_id is not null and app_is_team_member(p.team_id)))
  );
$$;

grant usage on schema public to vistora_app;
grant select, insert, update, delete on all tables in schema public to vistora_app;
grant execute on all functions in schema public to vistora_app;
-- Ledger and subscription rows are written only by the system context.
revoke insert, update, delete on credit_transactions, subscriptions from vistora_app;
revoke update, delete on password_reset_tokens from vistora_app;

do $$
declare t text;
begin
  foreach t in array array['users','profiles','sessions','password_reset_tokens','teams','team_members','projects','project_images',
    'generations','generation_jobs','reconstruction_jobs','asset_folders','models','model_versions','model_textures','model_metadata',
    'asset_tags','validation_reports','processing_jobs','export_jobs','subscriptions','credit_transactions','notifications']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

create policy users_self on users using (id = app_current_user_id()) with check (id = app_current_user_id());
create policy profiles_self on profiles using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());
create policy sessions_self on sessions using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());
create policy reset_tokens_none on password_reset_tokens using (false);

create policy teams_visible on teams for select using (owner_id = app_current_user_id() or app_is_team_member(id));
create policy teams_owner_write on teams for all using (owner_id = app_current_user_id()) with check (owner_id = app_current_user_id());
create policy team_members_visible on team_members for select using (app_is_team_member(team_id) or user_id = app_current_user_id());
create policy team_members_owner_write on team_members for all
  using (exists (select 1 from teams t where t.id = team_id and t.owner_id = app_current_user_id()))
  with check (exists (select 1 from teams t where t.id = team_id and t.owner_id = app_current_user_id()));

create policy projects_access on projects for select using (owner_id = app_current_user_id() or (team_id is not null and app_is_team_member(team_id)));
create policy projects_owner_insert on projects for insert with check (owner_id = app_current_user_id());
create policy projects_owner_update on projects for update using (owner_id = app_current_user_id() or (team_id is not null and app_is_team_member(team_id)));
create policy projects_owner_delete on projects for delete using (owner_id = app_current_user_id());

-- Project-scoped tables: readable by anyone who can access the project, writable by owner of the row.
create policy images_read on project_images for select using (app_can_access_project(project_id));
create policy images_write on project_images for all using (owner_id = app_current_user_id()) with check (owner_id = app_current_user_id() and app_can_access_project(project_id));
create policy generations_read on generations for select using (app_can_access_project(project_id));
create policy generations_write on generations for all using (owner_id = app_current_user_id()) with check (owner_id = app_current_user_id() and app_can_access_project(project_id));
create policy models_read on models for select using (app_can_access_project(project_id));
create policy models_write on models for all using (owner_id = app_current_user_id()) with check (owner_id = app_current_user_id());

do $$
declare t text;
begin
  foreach t in array array['generation_jobs','reconstruction_jobs','asset_folders','asset_tags','processing_jobs','export_jobs']
  loop
    execute format('create policy %I on %I using (owner_id = app_current_user_id()) with check (owner_id = app_current_user_id())', t || '_owner', t);
  end loop;
end $$;

create or replace function public.app_can_access_model(p_model uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from models m where m.id = p_model and app_can_access_project(m.project_id));
$$;
grant execute on function public.app_can_access_model(uuid) to vistora_app;

create policy versions_read on model_versions for select using (app_can_access_model(model_id));
create policy versions_write on model_versions for all using (owner_id = app_current_user_id()) with check (owner_id = app_current_user_id());
create policy reports_read on validation_reports for select using (app_can_access_model(model_id));
create policy reports_write on validation_reports for all using (owner_id = app_current_user_id()) with check (owner_id = app_current_user_id());
create policy textures_read on model_textures for select using (exists (select 1 from model_versions v where v.id = version_id and app_can_access_model(v.model_id)));
create policy textures_write on model_textures for all using (owner_id = app_current_user_id()) with check (owner_id = app_current_user_id());
create policy metadata_read on model_metadata for select using (exists (select 1 from model_versions v where v.id = version_id and app_can_access_model(v.model_id)));
create policy metadata_write on model_metadata for all using (owner_id = app_current_user_id()) with check (owner_id = app_current_user_id());

create policy subscriptions_read on subscriptions for select using (user_id = app_current_user_id());
create policy credits_read on credit_transactions for select using (user_id = app_current_user_id());
create policy notifications_self on notifications using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());
