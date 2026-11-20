-- On Supabase, the `public` schema is exposed through PostgREST to the `anon` and `authenticated` roles.
-- Vistora accesses data only through its own API, so those roles get no direct table access at all
-- (RLS policies remain as a second layer). No-op on plain PostgreSQL where the roles do not exist.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('alter default privileges in schema public revoke all on tables from %I', r);
    end if;
  end loop;
end $$;
