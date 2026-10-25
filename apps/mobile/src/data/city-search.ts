import type { City } from './cities';

/**
 * Lower-cases and strips diacritics, so a plain-ASCII query (what most
 * keyboards produce by default) still matches an accented name like "São
 * Paulo" or "Zürich" in the bundled dataset, and so a query that does carry
 * an accent matches the same way regardless.
 */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// City names are static, but `searchCities` re-ranks the whole dataset on
// every keystroke — caching each city's normalized name (keyed on the object
// itself, so it works for the real bundled dataset and any test fixture
// array alike) avoids repeating the same NFD normalization on every call.
const normalizedNames = new WeakMap<City, string>();

function normalizedName(city: City): string {
  let cached = normalizedNames.get(city);
  if (cached === undefined) {
    cached = normalize(city.name);
    normalizedNames.set(city, cached);
  }
  return cached;
}

/**
 * Ranks by how the query matches a city's name — exact, then prefix, then
 * substring — and breaks ties by population, so a query that matches several
 * cities surfaces the one a person most likely means first. Returns `null`
 * for no match at all.
 */
function matchRank(city: City, query: string): number | null {
  const name = normalizedName(city);
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(query)) return 2;
  return null;
}

/**
 * `[M1-03]` Pure, offline search over a bundled city list — no network, no
 * location permission, nothing but string comparison and a sort. An empty or
 * whitespace-only query returns no results rather than the whole dataset.
 */
export function searchCities(cities: readonly City[], query: string, limit = 20): City[] {
  const q = normalize(query.trim());
  if (q.length === 0) return [];

  return cities
    .map((city) => ({ city, rank: matchRank(city, q) }))
    .filter((entry): entry is { city: City; rank: number } => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank || b.city.population - a.city.population)
    .slice(0, limit)
    .map((entry) => entry.city);
}
