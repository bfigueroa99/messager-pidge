import type { PGlite } from '@electric-sql/pglite';
import { asUser, freshDb, seedUsers, type Fixture } from '../harness';

/**
 * `[M1-03]` The bundled cities dataset (`0009_seed_cities.sql`) must actually
 * land in a fresh database and be readable by a signed-in user — the loft
 * picker's "Do" list needs both a client-side search index (proven in
 * `apps/mobile/src/data/city-search.test.ts`) and a seed migration, and this
 * is the seed migration half. `cities_read` (0003_rls.sql) grants `select`
 * to `authenticated` only, not `anon` — so this reads as a signed-in user,
 * matching the real policy rather than a stricter one this test could invent.
 */
describe('the bundled cities dataset is seeded', () => {
  let db: PGlite;
  let fx: Fixture;

  beforeEach(async () => {
    db = await freshDb();
    fx = await seedUsers(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('[M1-03] a fresh database has a real set of cities, readable by a signed-in user', async () => {
    const rows = await asUser<{ count: number }>(db, fx.alice, 'select count(*)::int as count from cities');
    expect(rows[0]!.count).toBeGreaterThan(100);
  });

  it('[M1-03] the seeded dataset includes real, well-known cities snappable by the loft trigger', async () => {
    const rows = await asUser<{ id: string; name: string; lat: number; lon: number }>(
      db,
      fx.alice,
      'select id, name, lat, lon from cities where id = $1',
      ['us-los-angeles'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('Los Angeles');
    expect(rows[0]!.lat).toBeCloseTo(34.0522, 3);
    expect(rows[0]!.lon).toBeCloseTo(-118.2437, 3);
  });
});
