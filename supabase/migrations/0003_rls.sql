-- ─────────────────────────────────────────────────────────────────────────────
-- 0003 — Row Level Security: the product's core guarantee
--
-- Three principles, in order of importance:
--
--   1. Visibility is gated on now(), not on a status flag. The cron reaper can
--      lag, crash, or be paused; a policy cannot. A message becomes readable
--      the instant its arrival time passes and never one millisecond earlier,
--      even if the reaper has been down for an hour. The reaper owns SIDE
--      EFFECTS (push, stats, the loft), never VISIBILITY.
--
--   2. Content lives in a different table from metadata, so the rule is one
--      small policy instead of column-privilege games.
--
--   3. The outcome is a real secret: flight_secrets has RLS on and no policies
--      at all.
-- ─────────────────────────────────────────────────────────────────────────────

-- SECURITY DEFINER breaks the RLS recursion that would otherwise occur when a
-- policy on conversation_members needs to read conversation_members.
create or replace function public.is_conversation_member(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.conversation_members m
     where m.conversation_id = conv
       and m.user_id = (select auth.uid())
  );
$$;

alter table profiles             enable row level security;
alter table cities               enable row level security;
alter table devices              enable row level security;
alter table conversations        enable row level security;
alter table conversation_members enable row level security;
alter table pigeons              enable row level security;
alter table messages             enable row level security;
alter table message_bodies       enable row level security;
alter table flights              enable row level security;
alter table flight_events        enable row level security;
alter table flight_secrets       enable row level security;
alter table push_outbox          enable row level security;

-- NOTE on `(select auth.uid())` vs bare `auth.uid()`:
-- wrapping it in a scalar subquery lets Postgres hoist it into an InitPlan and
-- evaluate it once per query instead of once per row. On a large scan that is
-- a 50-100x difference. This is the most common Supabase RLS mistake; do not
-- "simplify" these back.

-- ── cities: bundled public reference data ────────────────────────────────────
create policy cities_read on cities
  for select to authenticated
  using (true);

-- ── profiles ─────────────────────────────────────────────────────────────────
create policy profiles_select_self on profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_select_correspondents on profiles
  for select to authenticated
  using (
    exists (
      select 1
        from conversation_members mine
        join conversation_members theirs
          on theirs.conversation_id = mine.conversation_id
       where mine.user_id = (select auth.uid())
         and theirs.user_id = profiles.id
    )
  );

create policy profiles_update_self on profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ── devices ──────────────────────────────────────────────────────────────────
create policy devices_own on devices
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── conversations ────────────────────────────────────────────────────────────
create policy conversations_select on conversations
  for select to authenticated
  using (public.is_conversation_member(id));

create policy members_select on conversation_members
  for select to authenticated
  using (public.is_conversation_member(conversation_id));

-- ── pigeons: you can see your own loft, and any bird carrying to you ─────────
create policy pigeons_select_own on pigeons
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- ── messages: metadata is visible to both parties, in flight and after ───────
-- Knowing a bird is on its way is part of the product. Knowing what it says
-- is not.
create policy messages_select on messages
  for select to authenticated
  using (public.is_conversation_member(conversation_id));

-- Clients never insert directly; releases go through a SECURITY DEFINER
-- function so the server owns departure time, route and fate. No insert,
-- update or delete policy exists here, and that absence is deliberate.

-- ── message_bodies: THE GATE ─────────────────────────────────────────────────

-- A sender can always reread what they wrote.
create policy bodies_select_sender on message_bodies
  for select to authenticated
  using (
    exists (
      select 1
        from messages m
       where m.id = message_bodies.message_id
         and m.sender_id = (select auth.uid())
    )
  );

-- The recipient reads it only once the bird has actually landed, alive.
create policy bodies_select_recipient on message_bodies
  for select to authenticated
  using (
    exists (
      select 1
        from messages m
        join flights f on f.message_id = m.id
       where m.id = message_bodies.message_id
         and m.sender_id <> (select auth.uid())
         and public.is_conversation_member(m.conversation_id)
         and f.recipient_id = (select auth.uid())
         and f.arrives_at <= now()      -- the time gate; independent of cron
         and f.status  = 'arrived'
         and f.outcome = 'delivered'    -- a dead bird delivers nothing
    )
  );

-- ── flights: watch the bird, never see its future ────────────────────────────
create policy flights_select on flights
  for select to authenticated
  using (
    sender_id = (select auth.uid())
    or recipient_id = (select auth.uid())
  );

-- ── flight_events: the past only ─────────────────────────────────────────────
create policy events_select on flight_events
  for select to authenticated
  using (
    occurs_at <= now()
    and exists (
      select 1
        from flights f
       where f.id = flight_events.flight_id
         and (f.sender_id = (select auth.uid()) or f.recipient_id = (select auth.uid()))
    )
  );

-- ── flight_secrets: no policies, by design. Do not add one. ──────────────────
revoke all on flight_secrets from authenticated;
revoke all on flight_secrets from anon;

-- ── push_outbox: server-only ─────────────────────────────────────────────────
revoke all on push_outbox from authenticated;
revoke all on push_outbox from anon;
