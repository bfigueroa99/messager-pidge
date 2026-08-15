-- ─────────────────────────────────────────────────────────────────────────────
-- 0001 — identity, geography, enums
--
-- Forward-only. Never edit a migration that has been merged; add a new one.
-- ─────────────────────────────────────────────────────────────────────────────

create type flight_status  as enum ('scheduled', 'in_flight', 'arrived', 'lost');
create type flight_outcome as enum ('pending', 'delivered', 'died');
create type death_cause    as enum ('hawk', 'storm', 'exhaustion', 'lost_bearings', 'window', 'cat');
create type event_kind     as enum ('departure', 'weather', 'predator', 'tailwind', 'rest', 'death', 'arrival');

-- Bundled reference data (a GeoNames subset). Public read.
-- Every stored user location is snapped to one of these centroids, which is
-- what keeps the app from ever knowing where anybody actually lives.
create table cities (
  id           text primary key,
  name         text not null,
  admin1       text,
  country_code text not null,
  lat          double precision not null check (lat between -90 and 90),
  lon          double precision not null check (lon between -180 and 180),
  population   integer
);

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  handle       text not null check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (length(display_name) between 1 and 40),

  -- COARSE location only. Never a raw GPS fix; see the snap trigger below.
  city_id             text references cities(id),
  city_label          text,
  home_lat            double precision check (home_lat between -90 and 90),
  home_lon            double precision check (home_lon between -180 and 180),
  location_consent_at timestamptz,
  location_updated_at timestamptz,

  created_at   timestamptz not null default now()
);

create unique index profiles_handle_lower_key on profiles (lower(handle));

-- Privacy is enforced here, in the database, rather than in the UI: a client
-- that POSTs a precise coordinate still gets it rounded to a city centroid
-- (~10 km, identical for everyone in that city) before it is ever stored.
create or replace function public.snap_profile_location()
returns trigger
language plpgsql
as $$
begin
  if new.home_lat is null or new.home_lon is null then
    return new;
  end if;

  select c.id,
         c.name || ', ' || coalesce(c.admin1, c.country_code),
         c.lat,
         c.lon
    into new.city_id, new.city_label, new.home_lat, new.home_lon
    from cities c
   order by (c.lat - new.home_lat) ^ 2 + (c.lon - new.home_lon) ^ 2
   limit 1;

  new.location_updated_at := now();
  return new;
end;
$$;

create trigger profiles_snap_location
  before insert or update of home_lat, home_lon on profiles
  for each row execute function public.snap_profile_location();

create table devices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  expo_push_token text not null,
  platform        text not null check (platform in ('ios', 'android', 'web')),
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  unique (user_id, expo_push_token)
);
