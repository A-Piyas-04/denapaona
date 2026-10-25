-- Minimal stand-in for the parts of Supabase the migrations depend on, so the
-- SQL suite can run against stock PostgreSQL 16 in Docker.  NEVER apply this to
-- a real Supabase project — it already has all of this.
--
-- auth.uid() reads the same setting Supabase's does (request.jwt.claims ->> sub),
-- so tests impersonate a user exactly the way PostgREST does on a real request.
-- Roles are cluster-wide, so they survive the per-run `drop database`.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls; end if;
end $$;

create schema auth;
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb not null default '{}'
);

create function auth.uid() returns uuid
language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;

grant usage on schema auth   to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
