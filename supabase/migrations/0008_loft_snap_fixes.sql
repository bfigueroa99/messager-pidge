-- ─────────────────────────────────────────────────────────────────────────────
-- 0008 — fix the loft snap: wrap the antimeridian, weight by latitude, fail
-- loudly, and clear the label when the loft is cleared.
--
-- snap_profile_location() is the single enforcement point for INV-7 (we never
-- store a precise location) and had four defects:
--   1. It compared raw squared degrees, so it neither wrapped at ±180 nor
--      scaled longitude by cos(lat) — a point just west of the antimeridian
--      could snap to a city 500+ km away in the wrong country while the
--      correct city sat 175 km away on the other side of the seam.
--   2. Clearing home_lat/home_lon returned early and left city_id/city_label
--      stale, so withdrawing a location still showed correspondents a city.
--   3. `select ... into` with no NOT FOUND guard silently nulled the
--      coordinates if `cities` was empty or unreadable, instead of raising.
--   4. It had no pinned search_path, unlike every other function here.
--
-- Forward-only. Never edit a migration that has been merged; add a new one.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.snap_profile_location()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_city_id    text;
  v_city_label text;
  v_lat        double precision;
  v_lon        double precision;
begin
  if new.home_lat is null or new.home_lon is null then
    new.city_id             := null;
    new.city_label          := null;
    new.location_updated_at := now();
    return new;
  end if;

  -- Nearest city by approximate ground distance: longitude is wrapped at the
  -- antimeridian (a degree of longitude either side of ±180 is one degree
  -- apart, not 359) and scaled by cos(lat), since a degree of longitude
  -- shrinks toward the poles and is worth nothing at all at one.
  select c.id,
         c.name || ', ' || coalesce(c.admin1, c.country_code),
         c.lat,
         c.lon
    into v_city_id, v_city_label, v_lat, v_lon
    from public.cities c
   order by (c.lat - new.home_lat) ^ 2
          + (
              least(abs(c.lon - new.home_lon), 360 - abs(c.lon - new.home_lon))
              * cos(radians(new.home_lat))
            ) ^ 2
   limit 1;

  if v_city_id is null then
    raise exception 'snap_profile_location: no city found to snap to';
  end if;

  new.city_id             := v_city_id;
  new.city_label          := v_city_label;
  new.home_lat            := v_lat;
  new.home_lon            := v_lon;
  new.location_updated_at := now();
  return new;
end;
$$;
