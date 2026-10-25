-- ─────────────────────────────────────────────────────────────────────────────
-- PGlite stand-ins for the pieces of Supabase that a plain Postgres does not
-- have. Applied BEFORE the migrations.
--
-- These exist so the RLS suite runs against real Postgres, with the real
-- migration files, in this container — which has no Docker daemon, so
-- `supabase start` is unavailable. What they cannot cover (real GoTrue auth,
-- Realtime authorization, actual pg_cron scheduling) is validated against a
-- hosted dev project instead; see docs/LOOP.md.
-- ─────────────────────────────────────────────────────────────────────────────

create role anon;
create role authenticated;
create role service_role;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase grants these by default on everything in `public`. Mirroring that
-- here matters: without table-level grants, RLS policies would never be
-- reached and every test would pass for the wrong reason.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

-- ── auth ─────────────────────────────────────────────────────────────────────
create schema auth;

create table auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- ── pg_cron ──────────────────────────────────────────────────────────────────
-- Scheduling is a production concern; here we only need the migration to apply.
create schema cron;

create table cron.job (
  jobid    bigserial primary key,
  jobname  text unique,
  schedule text,
  command  text
);

create or replace function cron.schedule(job_name text, schedule text, command text)
returns bigint
language sql
as $$
  insert into cron.job (jobname, schedule, command)
       values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule,
                                      command  = excluded.command
    returning jobid;
$$;

-- ── realtime ─────────────────────────────────────────────────────────────────
create schema realtime;

create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void
language plpgsql
as $$
begin
  -- no-op in tests
  return;
end;
$$;
