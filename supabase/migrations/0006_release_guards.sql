-- ─────────────────────────────────────────────────────────────────────────────
-- 0006 — release_pigeon guards the bird it is asked to fly, and the reaper
-- never resurrects one that has already died
--
-- release_pigeon previously checked nothing about the bird itself: any
-- authenticated caller could release a pigeon they did not own, release the
-- same pigeon twice while it was already in the air, or release one that had
-- already died. The reaper compounded the last case — its `birds` CTE
-- unconditionally overwrote `is_alive`, `died_at` and `death_flight_id` from
-- whatever flight it was resolving, so a flight that should never have
-- existed could still bring a dead bird back to life. `docs/PRODUCT.md` §8
-- forbids resurrection outright, and now nothing exists in this repository
-- forbidding it in name only.
--
-- Forward-only: `0004_release_and_reaper.sql` is not edited. Both functions
-- are redefined here in full.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.release_pigeon(
  p_conversation_id uuid,
  p_sender_id       uuid,
  p_recipient_id    uuid,
  p_body            text,
  p_origin_lat      double precision,
  p_origin_lon      double precision,
  p_dest_lat        double precision,
  p_dest_lon        double precision,
  p_distance_km     double precision,
  p_bearing_deg     double precision,
  p_speed_kmh       double precision,
  p_duration_ms     bigint,
  p_seed            bigint,
  p_outcome         flight_outcome,
  p_death_fraction  double precision default null,
  p_death_lat       double precision default null,
  p_death_lon       double precision default null,
  p_cause           death_cause default null,
  p_pigeon_id       uuid default null,
  p_sim_version     integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_departs   timestamptz := now();   -- the server owns the clock, not the caller
  v_arrives   timestamptz;
  v_death_at  timestamptz;
  v_resolve   timestamptz;
  v_message   uuid;
  v_flight    uuid;
  v_pigeon    pigeons;
begin
  if p_outcome not in ('delivered', 'died') then
    raise exception 'release_pigeon: outcome must be resolved at release time';
  end if;

  if p_pigeon_id is not null then
    -- Lock the bird for the rest of this transaction. Without the lock, two
    -- concurrent releases of the same pigeon could both read `in_flight =
    -- false` and both pass, which is exactly the "same bird carries two
    -- flights at once" defect this migration exists to close.
    select * into v_pigeon from pigeons where id = p_pigeon_id for update;

    if not found then
      raise exception 'release_pigeon: no such pigeon';
    end if;
    if v_pigeon.owner_id <> p_sender_id then
      raise exception 'release_pigeon: that pigeon does not belong to the sender';
    end if;
    if v_pigeon.in_flight then
      raise exception 'release_pigeon: that pigeon is already in the air';
    end if;
    if not v_pigeon.is_alive then
      raise exception 'release_pigeon: that pigeon is dead';
    end if;
  end if;

  v_arrives := v_departs + make_interval(secs => p_duration_ms / 1000.0);

  if p_outcome = 'died' then
    if p_death_fraction is null then
      raise exception 'release_pigeon: a doomed bird needs a death fraction';
    end if;
    v_death_at := v_departs + make_interval(secs => (p_duration_ms * p_death_fraction) / 1000.0);
    v_resolve  := v_death_at;
  else
    v_resolve  := v_arrives;
  end if;

  insert into messages (conversation_id, sender_id, created_at)
       values (p_conversation_id, p_sender_id, v_departs)
    returning id into v_message;

  insert into message_bodies (message_id, body) values (v_message, p_body);

  insert into flights (
    message_id, sender_id, recipient_id, pigeon_id,
    origin_lat, origin_lon, dest_lat, dest_lon,
    distance_km, initial_bearing_deg,
    departs_at, arrives_at, resolve_at,
    effective_speed_kmh, status, outcome, seed, sim_version
  ) values (
    v_message, p_sender_id, p_recipient_id, p_pigeon_id,
    p_origin_lat, p_origin_lon, p_dest_lat, p_dest_lon,
    p_distance_km, p_bearing_deg,
    v_departs, v_arrives, v_resolve,
    p_speed_kmh, 'in_flight', 'pending',   -- 'pending' in public, truth in the vault
    p_seed, p_sim_version
  ) returning id into v_flight;

  insert into flight_secrets (
    flight_id, planned_outcome, death_at, death_fraction, death_lat, death_lon, cause
  ) values (
    v_flight, p_outcome, v_death_at, p_death_fraction, p_death_lat, p_death_lon, p_cause
  );

  if p_pigeon_id is not null then
    update pigeons set in_flight = true where id = p_pigeon_id;
  end if;

  return v_flight;
end;
$$;

revoke all on function public.release_pigeon from public, anon, authenticated;


-- The reaper, redefined only in the one place that mattered: the `birds` CTE
-- now treats "already dead" as permanent. A pigeon that was alive when this
-- flight resolves still updates exactly as before — this changes nothing on
-- the path every existing test exercises. A pigeon that was already dead
-- stays dead, keeps its original `died_at`/`death_flight_id`, and does not
-- earn flight credit for a flight that, per the guard above, should never
-- have existed in the first place. Belt and suspenders: the guard stops the
-- bad flight from being created; this stops it from mattering if one exists
-- anyway.
create or replace function public.resolve_due_flights(batch integer default 500)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with due as (
    select f.id
      from flights f
     where f.status = 'in_flight'
       and f.resolve_at <= now()
     order by f.resolve_at
     limit batch
       for update skip locked          -- safe under overlapping cron ticks
  ),
  resolved as (
    update flights f
       set status = case when s.planned_outcome = 'delivered'
                         then 'arrived'::flight_status
                         else 'lost'::flight_status end,
           outcome = s.planned_outcome,   -- the secret becomes public HERE
           landed_at = f.resolve_at
      from flight_secrets s
     where s.flight_id = f.id
       and f.id in (select id from due)
    returning f.id, f.message_id, f.sender_id, f.recipient_id, f.pigeon_id,
              f.outcome, f.resolve_at, f.distance_km
  ),
  stamped as (
    update messages m
       set delivered_at = case when r.outcome = 'delivered' then r.resolve_at end,
           lost_at      = case when r.outcome = 'died'      then r.resolve_at end
      from resolved r
     where m.id = r.message_id
    returning m.id
  ),
  -- The note was not recovered. The fiction and the retention policy agree,
  -- so we hard-delete rather than tombstone.
  destroyed as (
    delete from message_bodies b
     using resolved r
     where b.message_id = r.message_id
       and r.outcome = 'died'
    returning b.message_id
  ),
  birds as (
    update pigeons p
       set in_flight = false,
           is_alive  = (p.is_alive and r.outcome = 'delivered'),
           died_at   = coalesce(p.died_at, case when r.outcome = 'died' then r.resolve_at end),
           death_flight_id = coalesce(p.death_flight_id, case when r.outcome = 'died' then r.id end),
           flights_completed = p.flights_completed
                             + case when r.outcome = 'delivered' and p.is_alive then 1 else 0 end,
           distance_flown_km = p.distance_flown_km
                             + case when r.outcome = 'delivered' and p.is_alive then r.distance_km else 0 end
      from resolved r
     where p.id = r.pigeon_id
    returning p.id
  ),
  queued as (
    insert into push_outbox (user_id, kind, title, body, data)
    select r.recipient_id,
           'arrived',
           'A pigeon has arrived',
           'It carried something for you.',
           jsonb_build_object('flight_id', r.id)
      from resolved r
     where r.outcome = 'delivered'
    union all
    -- Only the sender ever learns a lost message existed. The recipient is
    -- never told, which is the cruelty that makes the loss real — and which is
    -- also why the body can be destroyed with no downstream obligation.
    select r.sender_id,
           'lost',
           'Your pigeon did not arrive',
           'The note was not recovered.',
           jsonb_build_object('flight_id', r.id)
      from resolved r
     where r.outcome = 'died'
    returning id
  )
  select count(*) into v_count from resolved;

  return v_count;
end;
$$;

revoke all on function public.resolve_due_flights from public, anon, authenticated;
