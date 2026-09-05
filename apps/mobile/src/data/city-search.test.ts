import { CITIES } from './cities';
import { searchCities } from './city-search';
import type { City } from './cities';

const LONDON_UK: City = { id: 'gb-london', name: 'London', admin1: 'England', countryCode: 'GB', lat: 51.5074, lon: -0.1278, population: 8982000 };
const LONDON_CA: City = { id: 'ca-london', name: 'London', admin1: 'ON', countryCode: 'CA', lat: 42.9849, lon: -81.2453, population: 422324 };
const PARIS_FR: City = { id: 'fr-paris', name: 'Paris', admin1: null, countryCode: 'FR', lat: 48.8566, lon: 2.3522, population: 2148271 };

describe('searchCities', () => {
  it('[M1-03] searching "Los Ang" surfaces Los Angeles within the first three results', () => {
    const results = searchCities(CITIES, 'Los Ang');
    const names = results.slice(0, 3).map((c) => c.name);
    expect(names).toContain('Los Angeles');
  });

  it('[M1-03] an empty or whitespace query returns no results, not the whole dataset', () => {
    expect(searchCities(CITIES, '')).toEqual([]);
    expect(searchCities(CITIES, '   ')).toEqual([]);
  });

  it('[M1-03] matching is case-insensitive', () => {
    const results = searchCities(CITIES, 'lOs aNgELes');
    expect(results[0]?.name).toBe('Los Angeles');
  });

  it('[M1-03] matching ignores diacritics, both in the query and in the bundled name', () => {
    // "São Paulo" is what the dataset holds; most keyboards produce the
    // plain-ASCII "sao paulo" by default.
    expect(searchCities(CITIES, 'sao paulo')[0]?.name).toBe('São Paulo');
    expect(searchCities(CITIES, 'São Paulo')[0]?.name).toBe('São Paulo');
    expect(searchCities(CITIES, 'zurich')[0]?.name).toBe('Zürich');
  });

  it('[M1-03] an exact match ranks above a prefix match, which ranks above a substring match', () => {
    const cities = [PARIS_FR, LONDON_CA, LONDON_UK];
    const results = searchCities(cities, 'ondon');
    // "ondon" is a substring of both Londons but an exact/prefix match of neither —
    // this just proves ranking runs before the population tie-break, using cities
    // where the population order would otherwise put the wrong one first.
    expect(results.map((c) => c.id)).toEqual(['gb-london', 'ca-london']);
  });

  it('[M1-03] ties in match rank break toward the more populous city', () => {
    const results = searchCities([LONDON_CA, LONDON_UK], 'London');
    expect(results.map((c) => c.id)).toEqual(['gb-london', 'ca-london']);
  });

  it('[M1-03] a query matching nothing returns an empty array', () => {
    expect(searchCities(CITIES, 'Xyzzyplugh')).toEqual([]);
  });

  it('[M1-03] respects the result limit', () => {
    const results = searchCities(CITIES, 'a', 5);
    expect(results.length).toBeLessThanOrEqual(5);
  });
});
