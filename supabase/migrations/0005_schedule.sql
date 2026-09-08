-- ─────────────────────────────────────────────────────────────────────────────
-- 0005 — schedule the reaper
--
-- Ten seconds is generous: the worst-case lateness it can add to a 22-hour
-- flight is invisible. And because RLS gates on now() rather than on `status`,
-- a cron outage delays the push notification but never the message itself.
-- Supabase Cron does not retry skipped runs and does not alert, which is
-- exactly why correctness must not depend on it.
-- ─────────────────────────────────────────────────────────────────────────────

select cron.schedule(
  'resolve-flights',
  '10 seconds',
  $$select public.resolve_due_flights();$$
);
