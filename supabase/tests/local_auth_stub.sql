-- ONLY for an empty, disposable vanilla PostgreSQL database. This file mocks
-- the minimal Supabase Auth surface for schema tests. NEVER run on Supabase.
-- It is not a migration, and does not test Supabase Auth or real API sessions.
do $$
begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end;
$$;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb
);
