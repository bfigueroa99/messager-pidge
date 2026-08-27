import type { PGlite } from '@electric-sql/pglite';
import { asAnon, asUser, freshDb, release, rewind, seedUsers, type Fixture } from '../harness';

const HOUR = 3_600_000;

describe('the core guarantee: a message in flight is unreadable', () => {
  let db: PGlite;
  let fx: Fixture;

  beforeEach(async () => {
    db = await freshDb();
    fx = await seedUsers(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('[M0-05] the recipient CANNOT read the body of a bird still in the air', async () => {
    // This is the product. If this test ever goes red, nothing else matters.
    const flightId = await release(db, fx, { durationMs: 22 * HOUR });
    expect(flightId).toBeTruthy();

    const rows = await asUser(db, fx.bob, `select * from message_bodies`);
    expect(rows).toHaveLength(0);
  });

  it('[M0-05] the recipient still cannot read it one second before landing', async () => {
    const flightId = await release(db, fx, { durationMs: 22 * HOUR });
    await rewind(db, flightId, 22 * HOUR - 1000);
    await db.query(`select public.resolve_due_flights()`);

    expect(await asUser(db, fx.bob, `select * from message_bodies`)).toHaveLength(0);
  });

  it('[M0-05] the recipient CAN read it once the bird has landed', async () => {
    const flightId = await release(db, fx, { durationMs: 22 * HOUR });
    await rewind(db, flightId, 23 * HOUR);
    await db.query(`select public.resolve_due_flights()`);

    const rows = await asUser<{ body: string }>(db, fx.bob, `select body from message_bodies`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toMatch(/coffee/);
  });

  it('[M0-05] the sender can always reread their own note, even mid-flight', async () => {
    await release(db, fx, { durationMs: 22 * HOUR });
    expect(await asUser(db, fx.alice, `select body from message_bodies`)).toHaveLength(1);
  });

  it('[M0-05] a stranger sees nothing at all', async () => {
    const flightId = await release(db, fx, { durationMs: 22 * HOUR });
    await rewind(db, flightId, 23 * HOUR);
    await db.query(`select public.resolve_due_flights()`);

    expect(await asUser(db, fx.carol, `select * from message_bodies`)).toHaveLength(0);
    expect(await asUser(db, fx.carol, `select * from messages`)).toHaveLength(0);
    expect(await asUser(db, fx.carol, `select * from flights`)).toHaveLength(0);
  });

  it('[M0-05] a signed-out visitor sees nothing at all', async () => {
    await release(db, fx, { durationMs: 22 * HOUR });
    expect(await asAnon(db, `select * from message_bodies`)).toHaveLength(0);
    expect(await asAnon(db, `select * from messages`)).toHaveLength(0);
  });
});

describe('death destroys the note', () => {
  let db: PGlite;
  let fx: Fixture;

  beforeEach(async () => {
    db = await freshDb();
    fx = await seedUsers(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('[M0-05] the recipient NEVER reads the note of a bird that died', async () => {
    const flightId = await release(db, fx, {
      outcome: 'died',
      durationMs: 22 * HOUR,
      deathFraction: 0.5,
    });
    await rewind(db, flightId, 23 * HOUR);
    await db.query(`select public.resolve_due_flights()`);

    expect(await asUser(db, fx.bob, `select * from message_bodies`)).toHaveLength(0);
  });

  it('[M0-05] the note is hard-deleted, not merely hidden', async () => {
    // The fiction (the note was not recovered) and the retention policy are
    // the same rule. Nothing is left on disk to leak later.
    const flightId = await release(db, fx, {
      outcome: 'died',
      durationMs: 22 * HOUR,
      deathFraction: 0.5,
    });
    await rewind(db, flightId, 23 * HOUR);
    await db.query(`select public.resolve_due_flights()`);

    const { rows } = await db.query<{ count: string }>(`select count(*) from message_bodies`);
    expect(Number(rows[0]!.count)).toBe(0);
  });

  it('[M0-05] the recipient is never told that a lost message existed', async () => {
    const flightId = await release(db, fx, { outcome: 'died', durationMs: 22 * HOUR });
    await rewind(db, flightId, 23 * HOUR);
    await db.query(`select public.resolve_due_flights()`);

    const notified = await db.query<{ user_id: string; kind: string }>(
      `select user_id, kind from push_outbox`,
    );
    expect(notified.rows).toHaveLength(1);
    expect(notified.rows[0]!.user_id).toBe(fx.alice);
    expect(notified.rows[0]!.kind).toBe('lost');
  });
});

describe('the outcome is a real secret', () => {
  let db: PGlite;
  let fx: Fixture;

  beforeEach(async () => {
    db = await freshDb();
    fx = await seedUsers(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('[M0-05] nobody — not even the sender — can select from flight_secrets', async () => {
    await release(db, fx, { outcome: 'died', durationMs: 22 * HOUR });

    await expect(asUser(db, fx.alice, `select * from flight_secrets`)).rejects.toThrow(
      /permission denied/i,
    );
    await expect(asUser(db, fx.bob, `select * from flight_secrets`)).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('[M0-05] a doomed flight still reads as "pending" while it is in the air', async () => {
    // Otherwise a curious user with a REST client learns their bird is doomed
    // twenty hours early, and the whole thing collapses.
    await release(db, fx, { outcome: 'died', durationMs: 22 * HOUR });

    const rows = await asUser<{ outcome: string; status: string }>(
      db,
      fx.alice,
      `select outcome, status from flights`,
    );
    expect(rows[0]!.outcome).toBe('pending');
    expect(rows[0]!.status).toBe('in_flight');
  });

  it('[M0-05] flight events in the future are invisible to both parties', async () => {
    const flightId = await release(db, fx, { durationMs: 22 * HOUR });
    await db.query(
      `insert into flight_events (flight_id, kind, occurs_at)
       values ($1, 'weather', now() + interval '5 hours'),
              ($1, 'departure', now() - interval '1 minute')`,
      [flightId],
    );

    for (const uid of [fx.alice, fx.bob]) {
      const rows = await asUser<{ kind: string }>(db, uid, `select kind from flight_events`);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.kind).toBe('departure');
    }
  });
});

describe('visibility is gated on now(), independent of the reaper', () => {
  let db: PGlite;
  let fx: Fixture;

  beforeEach(async () => {
    db = await freshDb();
    fx = await seedUsers(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('[M0-10] the recipient can read a landed flight\'s note with the reaper never run', async () => {
    const flightId = await release(db, fx, { durationMs: 22 * HOUR });
    await rewind(db, flightId, 23 * HOUR);

    const rows = await asUser<{ body: string }>(db, fx.bob, `select body from message_bodies`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toMatch(/coffee/);
  });

  it('[M0-10] a doomed flight\'s note stays unreadable with the reaper never run', async () => {
    const flightId = await release(db, fx, {
      outcome: 'died',
      durationMs: 22 * HOUR,
      deathFraction: 0.5,
    });
    await rewind(db, flightId, 23 * HOUR);

    expect(await asUser(db, fx.bob, `select * from message_bodies`)).toHaveLength(0);
  });

  it('[M0-10] the in-flight cases still hold with the reaper never run', async () => {
    await release(db, fx, { durationMs: 22 * HOUR });
    expect(await asUser(db, fx.bob, `select * from message_bodies`)).toHaveLength(0);
  });

  it('[M0-10] the recipient still cannot read it one second before landing, with the reaper never run', async () => {
    const flightId = await release(db, fx, { durationMs: 22 * HOUR });
    await rewind(db, flightId, 22 * HOUR - 1000);

    expect(await asUser(db, fx.bob, `select * from message_bodies`)).toHaveLength(0);
  });
});

describe('the reaper', () => {
  let db: PGlite;
  let fx: Fixture;

  beforeEach(async () => {
    db = await freshDb();
    fx = await seedUsers(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('[M0-05] is idempotent — running it twice resolves a flight once', async () => {
    const flightId = await release(db, fx, { durationMs: 22 * HOUR });
    await rewind(db, flightId, 23 * HOUR);

    const first = await db.query<{ resolve_due_flights: number }>(
      `select public.resolve_due_flights()`,
    );
    const second = await db.query<{ resolve_due_flights: number }>(
      `select public.resolve_due_flights()`,
    );

    expect(first.rows[0]!.resolve_due_flights).toBe(1);
    expect(second.rows[0]!.resolve_due_flights).toBe(0);

    const pushes = await db.query<{ count: string }>(`select count(*) from push_outbox`);
    expect(Number(pushes.rows[0]!.count)).toBe(1);
  });

  it('[M0-05] leaves a flight alone until its moment has come', async () => {
    await release(db, fx, { durationMs: 22 * HOUR });
    const { rows } = await db.query<{ resolve_due_flights: number }>(
      `select public.resolve_due_flights()`,
    );
    expect(rows[0]!.resolve_due_flights).toBe(0);
  });

  it('[M0-05] stamps landed_at from the scheduled time, not from when it ran', async () => {
    // Cron jitter must never leak into a timestamp a user can see.
    const flightId = await release(db, fx, { durationMs: 22 * HOUR });
    await rewind(db, flightId, 30 * HOUR);
    await db.query(`select public.resolve_due_flights()`);

    const { rows } = await db.query<{ same: boolean }>(
      `select landed_at = resolve_at as same from flights where id = $1`,
      [flightId],
    );
    expect(rows[0]!.same).toBe(true);
  });

  it('[M0-05] resolves a doomed bird at its death, before it would have landed', async () => {
    const flightId = await release(db, fx, {
      outcome: 'died',
      durationMs: 22 * HOUR,
      deathFraction: 0.5,
    });
    const { rows } = await db.query<{ early: boolean }>(
      `select resolve_at < arrives_at as early from flights where id = $1`,
      [flightId],
    );
    expect(rows[0]!.early).toBe(true);
  });
});

describe('clients cannot write flights or messages directly', () => {
  let db: PGlite;
  let fx: Fixture;

  beforeEach(async () => {
    db = await freshDb();
    fx = await seedUsers(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('[M0-05] an authenticated user cannot insert a message', async () => {
    await expect(
      asUser(db, fx.alice, `insert into messages (conversation_id, sender_id) values ($1,$2)`, [
        fx.conversationId,
        fx.alice,
      ]),
    ).rejects.toThrow(/row-level security|violates/i);
  });

  it('[M0-05] an authenticated user cannot forge a flight', async () => {
    await expect(
      asUser(
        db,
        fx.alice,
        `insert into flights (message_id, sender_id, recipient_id, origin_lat, origin_lon,
                              dest_lat, dest_lon, distance_km, initial_bearing_deg,
                              departs_at, arrives_at, resolve_at, effective_speed_kmh, seed)
         values (gen_random_uuid(),$1,$2,0,0,0,0,1,1,now(),now()+interval '1 hour',
                 now()+interval '1 hour',177,1)`,
        [fx.alice, fx.bob],
      ),
    ).rejects.toThrow(/row-level security|violates/i);
  });

  it('[M0-05] the release function refuses a note longer than 280 characters', async () => {
    await expect(release(db, fx, { body: 'x'.repeat(281) })).rejects.toThrow(/check constraint/i);
  });
});

describe('location is coarsened by the database, not the UI', () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await freshDb();
    // 0009_seed_cities.sql (M1-03) now seeds ~130 real cities, including its
    // own real Los Angeles row — clear it first so this test's own 'la'
    // fixture (the specific id it asserts against below) is the only
    // candidate at this coordinate, not a coin flip between two rows at an
    // identical distance.
    await db.query('delete from cities');
    await db.query(
      `insert into cities (id, name, admin1, country_code, lat, lon, population)
       values ('la','Los Angeles','CA','US',34.0522,-118.2437,3898747),
              ('nyc','New York','NY','US',40.7128,-74.0060,8336817)`,
    );
  });

  afterEach(async () => {
    await db.close();
  });

  it('[M0-05] snaps a precise GPS fix to a city centroid before storing it', async () => {
    // Even a malicious client POSTing an exact address gets it rounded to a
    // point shared by everyone in that city.
    const { rows: users } = await db.query<{ id: string }>(
      `insert into auth.users (email) values ('spy@example.test') returning id`,
    );
    const id = users[0]!.id;

    await db.query(
      `insert into profiles (id, handle, display_name, home_lat, home_lon)
       values ($1,'spy','Spy',34.089215,-118.276566)`,
      [id],
    );

    const { rows } = await db.query<{
      home_lat: number;
      home_lon: number;
      city_id: string;
      city_label: string;
    }>(`select home_lat, home_lon, city_id, city_label from profiles where id = $1`, [id]);

    expect(rows[0]!.city_id).toBe('la');
    expect(rows[0]!.city_label).toBe('Los Angeles, CA');
    expect(rows[0]!.home_lat).toBe(34.0522);
    expect(rows[0]!.home_lon).toBe(-118.2437);
  });
});
