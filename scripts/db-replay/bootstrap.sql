-- Minimal stand-in for the parts of a Supabase project that migrations assume
-- already exist (roles, auth/storage/extensions schemas, auth.uid()/role()).
-- Test-only: this is NOT how a real Supabase project is created.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_admin nologin;
create role supabase_auth_admin nologin;
create role supabase_storage_admin nologin;

create schema extensions;
create schema auth;
create schema storage;
create schema graphql_public;
create schema vault;
grant usage on schema public, extensions to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb not null default '{}',
  raw_user_meta_data jsonb not null default '{}'
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[],
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text, owner uuid, metadata jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select string_to_array(name, '/') $$;
create function storage.filename(name text) returns text language sql immutable as
  $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
create function storage.extension(name text) returns text language sql immutable as
  $$ select split_part(name, '.', 2) $$;
grant usage on schema auth, storage to anon, authenticated, service_role;


-- Hosted Supabase grants the API roles access to new public objects by default and
-- relies on RLS (and later REVOKEs) to restrict them; mirror that so the checks mean something.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Hosted Supabase lets the API roles reach storage.objects (RLS then restricts it).
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
