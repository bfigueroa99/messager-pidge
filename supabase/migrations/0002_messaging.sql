-- ─────────────────────────────────────────────────────────────────────────────
-- 0002 — conversations, messages, and the pigeons that carry them
-- ─────────────────────────────────────────────────────────────────────────────

create table conversations (
  id         uuid primary key default gen_random_uuid(),
  -- 'uuidA:uuidB' with the ids sorted, so a pair can only ever have one thread.
  dm_key     text unique not null,
  created_at timestamptz not null default now()
);

create table conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,
  last_read_at    timestamptz,
  primary key (conversation_id, user_id)
);

-- The loft. Birds are named and have histories; they do not have stat blocks.
create table pigeons (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references profiles(id) on delete cascade,
  name              text not null check (length(name) between 1 and 24),
  is_alive          boolean not null default true,
  in_flight         boolean not null default false,
  flights_completed integer not null default 0,
  distance_flown_km double precision not null default 0,
  acquired_at       timestamptz not null default now(),
  died_at           timestamptz,
  death_flight_id   uuid
);

create index pigeons_owner_idx on pigeons (owner_id) where is_alive;

-- METADATA. Both parties may see that a bird is on its way.
create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id       uuid not null references profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  delivered_at    timestamptz,
  lost_at         timestamptz
);

-- CONTENT, in its own table on purpose.
--
-- Keeping the body separate from the metadata means the "you cannot read this
-- yet" rule is a row-level policy on one small table rather than a
-- column-privilege puzzle — which makes it simple to reason about and simple
-- to test. On death the row is deleted outright: the fiction (the note was
-- never recovered) and the retention policy are the same rule.
create table message_bodies (
  message_id uuid primary key references messages(id) on delete cascade,
  body       text not null check (length(body) between 1 and 280)
);

create table flights (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null unique references messages(id) on delete cascade,
  sender_id    uuid not null references profiles(id),
  recipient_id uuid not null references profiles(id),
  pigeon_id    uuid references pigeons(id),

  -- The route is snapshotted at release and never changes, so a recipient who
  -- moves mid-flight does not teleport a bird already in the air.
  origin_lat double precision not null,
  origin_lon double precision not null,
  dest_lat   double precision not null,
  dest_lon   double precision not null,
  origin_label text,
  dest_label   text,
  distance_km  double precision not null,
  initial_bearing_deg double precision not null,

  departs_at timestamptz not null,
  arrives_at timestamptz not null,
  -- min(arrives_at, death_at). The reaper's index key, and the instant at
  -- which the outcome stops being a secret.
  resolve_at timestamptz not null,

  effective_speed_kmh double precision not null,

  status  flight_status  not null default 'in_flight',
  -- Stays 'pending' in this table until the reaper resolves it. The truth
  -- lives in flight_secrets until the moment it happens.
  outcome flight_outcome not null default 'pending',
  landed_at timestamptz,

  seed        bigint not null,
  sim_version integer not null default 1,
  created_at  timestamptz not null default now(),

  check (arrives_at > departs_at),
  check (resolve_at <= arrives_at)
);

-- The reaper scans exactly this: in-flight birds whose moment has come.
create index flights_due_idx on flights (resolve_at) where status = 'in_flight';
create index flights_recipient_idx on flights (recipient_id, arrives_at desc);
create index flights_sender_idx on flights (sender_id, created_at desc);

-- THE VAULT.
--
-- RLS is enabled and there are deliberately ZERO policies, with grants revoked.
-- Not even the sender's own session can read this. If a client could learn the
-- outcome early it would eventually render it, and a user would watch a doomed
-- bird for twenty hours knowing it was doomed. That would end the product.
create table flight_secrets (
  flight_id      uuid primary key references flights(id) on delete cascade,
  planned_outcome flight_outcome not null check (planned_outcome in ('delivered', 'died')),
  death_at       timestamptz,
  death_fraction double precision,
  death_lat      double precision,
  death_lon      double precision,
  cause          death_cause
);

-- Revealed progressively as occurs_at passes; the future is invisible.
create table flight_events (
  id        uuid primary key default gen_random_uuid(),
  flight_id uuid not null references flights(id) on delete cascade,
  kind      event_kind not null,
  occurs_at timestamptz not null,
  lat       double precision,
  lon       double precision,
  payload   jsonb not null default '{}'::jsonb
);

create index flight_events_timeline_idx on flight_events (flight_id, occurs_at);

create table push_outbox (
  id           bigserial primary key,
  user_id      uuid not null references profiles(id) on delete cascade,
  kind         text not null,
  title        text not null,
  body         text not null,
  data         jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz not null default now(),
  sent_at      timestamptz,
  attempts     integer not null default 0,
  last_error   text
);

create index push_outbox_pending_idx on push_outbox (scheduled_at) where sent_at is null;
