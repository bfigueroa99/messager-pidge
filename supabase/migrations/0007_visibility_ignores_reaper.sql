-- ─────────────────────────────────────────────────────────────────────────────
-- 0007 — message visibility must be gated on now(), not on the reaper
--
-- bodies_select_recipient (0003_rls.sql) checked f.arrives_at <= now() — the
-- correct time gate — but ALSO checked f.status = 'arrived' and f.outcome =
-- 'delivered', columns that stay at their release-time defaults
-- ('in_flight'/'pending') until `resolve_due_flights` runs. ADR-002 and INV-5
-- exist precisely so a cron outage delays a push notification but never a
-- message: with cron down, a flight that landed eight hours ago was
-- unreadable, because nothing had flipped those columns yet.
--
-- The fate is decided at release and lives in flight_secrets
-- (planned_outcome), never in the reaper. This migration adds a
-- SECURITY DEFINER helper — the same shape as is_conversation_member in
-- 0003_rls.sql — that reads flight_secrets directly (message_bodies' own
-- policy runs as the querying user, who has no grant on flight_secrets at
-- all) and redefines the policy to gate on it plus arrives_at, dropping the
-- status/outcome columns from the check entirely.
--
-- The function checks recipient_id = auth.uid() itself, exactly like
-- is_conversation_member checks membership itself, rather than trusting the
-- one policy that happens to call it: EXECUTE on a new function defaults to
-- PUBLIC, and the policy's own role (authenticated) needs that grant to
-- evaluate at all, so a function that only checked the flight id would let
-- any authenticated caller learn a stranger's flight outcome by UUID alone.
--
-- Forward-only: 0003_rls.sql is not edited.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.flight_delivered_to_recipient(p_flight_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.flights f
      join public.flight_secrets s on s.flight_id = f.id
     where f.id = p_flight_id
       and f.recipient_id = (select auth.uid())
       and f.arrives_at <= now()
       and s.planned_outcome = 'delivered'
  );
$$;

drop policy bodies_select_recipient on message_bodies;

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
         and public.flight_delivered_to_recipient(f.id)
    )
  );
