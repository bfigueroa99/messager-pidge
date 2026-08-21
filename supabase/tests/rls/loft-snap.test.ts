import type { PGlite } from '@electric-sql/pglite';
import { freshDb } from '../harness';

/**
 * `snap_profile_location()` is the single enforcement point for INV-7 (we
 * never store a precise location) — every stored coordinate must be a city
 * centroid, chosen by real ground distance, or the trigger must refuse to
 * write at all.
 */
describe('the loft snap picks the nearest city by ground distance', () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await freshDb();
  });

  afterEach(async () => {
    await db.close();
  });

  const mkUser = async (email: string): Promise<string> => {
    const { rows } = await db.query<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [email],
    );
    return rows[0]!.id;
  };

  it('[M0-11] a point just west of the antimeridian keeps its city on the correct side of the seam', async () => {
    // Real distances: (-18.2, -179.9) is ~175 km from Suva and ~590 km from
    // Nuku'alofa. A comparison of raw squared degrees sees a 358-degree gap
    // to Suva and a 4.7-degree gap to Nuku'alofa, and picks the wrong one —
    // in the wrong country, 3x further away.
    await db.query(
      `insert into cities (id, name, admin1, country_code, lat, lon, population)
       values ('suva', 'Suva', null, 'FJ', -18.1416, 178.4419, 93970),
              ('nukualofa', 'Nuku''alofa', null, 'TO', -21.1393, -175.2018, 23221)`,
    );
    const id = await mkUser('antimeridian@example.test');

    await db.query(
      `insert into profiles (id, handle, display_name, home_lat, home_lon)
       values ($1, 'traveler', 'Traveler', -18.2, -179.9)`,
      [id],
    );

    const { rows } = await db.query<{ city_id: string }>(
      `select city_id from profiles where id = $1`,
      [id],
    );
    expect(rows[0]!.city_id).toBe('suva');
  });

  it('[M0-11] a high-latitude point snaps to the nearest city by ground distance, not raw degrees', async () => {
    // At 65N, one degree of longitude is worth ~47 km, not ~111 km. A point
    // at (65, 0) is ~469 km from (65, 10) and ~556 km from (60, 0) — but
    // unweighted squared degrees says the opposite: 100 (10 degrees of lon)
    // versus 25 (5 degrees of lat), so the unweighted comparison picks the
    // farther city.
    await db.query(
      `insert into cities (id, name, admin1, country_code, lat, lon, population)
       values ('near', 'Near', null, 'XX', 65.0, 10.0, 1000),
              ('far', 'Far', null, 'XX', 60.0, 0.0, 1000)`,
    );
    const id = await mkUser('polar@example.test');

    await db.query(
      `insert into profiles (id, handle, display_name, home_lat, home_lon)
       values ($1, 'polarbear', 'Polar Bear', 65.0, 0.0)`,
      [id],
    );

    const { rows } = await db.query<{ city_id: string }>(
      `select city_id from profiles where id = $1`,
      [id],
    );
    expect(rows[0]!.city_id).toBe('near');
  });

  it('[M0-11] clearing the loft clears the city label with it', async () => {
    await db.query(
      `insert into cities (id, name, admin1, country_code, lat, lon, population)
       values ('la', 'Los Angeles', 'CA', 'US', 34.0522, -118.2437, 3898747)`,
    );
    const id = await mkUser('mover@example.test');

    await db.query(
      `insert into profiles (id, handle, display_name, home_lat, home_lon)
       values ($1, 'mover', 'Mover', 34.05, -118.24)`,
      [id],
    );

    await db.query(`update profiles set home_lat = null, home_lon = null where id = $1`, [id]);

    const { rows } = await db.query<{
      city_id: string | null;
      city_label: string | null;
      home_lat: number | null;
      home_lon: number | null;
    }>(`select city_id, city_label, home_lat, home_lon from profiles where id = $1`, [id]);

    expect(rows[0]!.city_id).toBeNull();
    expect(rows[0]!.city_label).toBeNull();
    expect(rows[0]!.home_lat).toBeNull();
    expect(rows[0]!.home_lon).toBeNull();
  });

  it('[M0-11] the trigger raises rather than silently nulling a coordinate when no city matches', async () => {
    // `cities` is empty in this test — a real gap (unseeded/unreadable
    // reference data) that must fail loudly rather than write an unsnapped,
    // precise coordinate.
    const id = await mkUser('noone@example.test');

    await expect(
      db.query(
        `insert into profiles (id, handle, display_name, home_lat, home_lon)
         values ($1, 'noone', 'No One', 34.05, -118.24)`,
        [id],
      ),
    ).rejects.toThrow(/no city found to snap to/);
  });

  it('[M0-11] the function runs with a pinned search_path', async () => {
    const { rows } = await db.query<{ proconfig: string[] | null }>(
      `select proconfig from pg_proc where proname = 'snap_profile_location'`,
    );
    expect(rows[0]!.proconfig).toEqual(expect.arrayContaining([expect.stringMatching(/^search_path=/)]));
  });
});
