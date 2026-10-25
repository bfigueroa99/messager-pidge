-- ─────────────────────────────────────────────────────────────────────────────
-- 0004 — releasing a bird, and resolving it when its moment comes
-- ─────────────────────────────────────────────────────────────────────────────

-- Release.
--
-- The flight plan itself is computed by @pidge/flight-sim in the Edge Function
-- (one implementation, shared by client, server and tests) and handed here
-- already rolled. This function's job is to write it down atomically and to
-- make sure the client cannot influence the parts that must be the server's:
-- `departs_at` comes from the database clock, and the outcome goes straight
-- into the vault.
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
begin
  if p_outcome not in ('delivered', 'died') then
    raise exception 'release_pigeon: outcome must be resolved at release time';
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


-- The reaper.
--
-- Everything a resolution implies — flight status, message timestamps, the
-- bird's life or death, the destruction of a lost note, the queued push —
-- happens in ONE statement inside ONE transaction. Either the bird landed and
-- the message is delivered and the notification is queued, or none of it
-- happened.
--
-- `landed_at` is set from resolve_at rather than now(), so cron jitter never
-- leaks into a timestamp a user can see.
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
           is_alive  = (r.outcome = 'delivered'),
           died_at   = case when r.outcome = 'died' then r.resolve_at end,
           death_flight_id = case when r.outcome = 'died' then r.id end,
           flights_completed = p.flights_completed
                             + case when r.outcome = 'delivered' then 1 else 0 end,
           distance_flown_km = p.distance_flown_km
                             + case when r.outcome = 'delivered' then r.distance_km else 0 end
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
