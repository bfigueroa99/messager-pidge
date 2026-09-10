import rawCities from './cities.json';

/**
 * A `[id, name, admin1, countryCode, lat, lon, population]` tuple. This is
 * the shape `cities.json` — the single source of truth for the bundled
 * dataset — actually holds. `resolveJsonModule` infers a loose
 * `(string | number | null)[][]` for it (JSON has no tuple types), so one
 * cast at the module boundary is unavoidable; everything downstream of
 * `CITIES` sees the precise `City` type with no further casting.
 */
type RawCity = [
  id: string,
  name: string,
  admin1: string | null,
  countryCode: string,
  lat: number,
  lon: number,
  population: number,
];

export interface City {
  readonly id: string;
  readonly name: string;
  /** State, province or region. `null` for city-states and similar. */
  readonly admin1: string | null;
  readonly countryCode: string;
  readonly lat: number;
  readonly lon: number;
  readonly population: number;
}

/**
 * `[M1-03]` A curated, real-world subset of cities (not a literal GeoNames
 * extract — this container has no network access to fetch one; see the
 * `docs/JOURNAL.md` entry for this item). Bundled with the app so the loft
 * picker can search with no network and no location permission.
 */
export const CITIES: readonly City[] = (rawCities as RawCity[]).map(
  ([id, name, admin1, countryCode, lat, lon, population]) => ({
    id,
    name,
    admin1,
    countryCode,
    lat,
    lon,
    population,
  }),
);
