import type { PGlite } from '@electric-sql/pglite';
import { addPigeon, freshDb, release, rewind, seedUsers, type Fixture } from '../harness';

const HOUR = 3_600_000;

describe('release_pigeon guards the bird it is asked to fly', () => {
  let db: PGlite;
  let fx: Fixture;

  beforeEach(async () => {
    db = await freshDb();
    fx = await seedUsers(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('[M0-09] a user cannot release a bird belonging to someone else', async () => {
    const bobsBird = await addPigeon(db, fx.bob);

    await expect(
      release(db, fx, { senderId: fx.alice, pigeonId: bobsBird }),
    ).rejects.toThrow(/does not belong to the sender/);
  });

  it('[M0-09] a bird already in the air cannot be released again', async () => {
    const wren = await addPigeon(db, fx.alice);

    await release(db, fx, { pigeonId: wren, durationMs: 22 * HOUR });

    await expect(release(db, fx, { pigeonId: wren, durationMs: 22 * HOUR })).rejects.toThrow(
      /already in the air/,
    );
  });

  it('[M0-09] a dead bird cannot be released', async () => {
    const wren = await addPigeon(db, fx.alice);

    const flightId = await release(db, fx, {
      pigeonId: wren,
      outcome: 'died',
      durationMs: 22 * HOUR,
    });
    await rewind(db, flightId, 23 * HOUR);
    await db.query(`select public.resolve_due_flights()`);

    const { rows } = await db.query<{ is_alive: boolean }>(
      `select is_alive from pigeons where id = $1`,
      [wren],
    );
    expect(rows[0]!.is_alive).toBe(false);

    await expect(release(db, fx, { pigeonId: wren, durationMs: 22 * HOUR })).rejects.toThrow(
      /is dead/,
    );
  });

  it('[M0-09] delivering a flight never resurrects a bird that died on an earlier one', async () => {
    // A dead bird cannot pass through release_pigeon again — the guard above
    // proves that. This proves the second, independent line of defence: even
    // if a flight for an already-dead pigeon existed (bad data, a bug
    // upstream of this migration, anything), the reaper itself must never
    // bring it back. So this flight is inserted directly, bypassing
    // release_pigeon entirely, exactly as such a flight would have to.
    const originalDeath = '2020-01-01T00:00:00Z';
    const wren = await addPigeon(db, fx.alice, { isAlive: false, diedAt: originalDeath });

    const { rows: msgRows } = await db.query<{ id: string }>(
      `insert into messages (conversation_id, sender_id, created_at)
       values ($1, $2, now() - interval '1 hour')
       returning id`,
      [fx.conversationId, fx.alice],
    );
    const messageId = msgRows[0]!.id;
    await db.query(`insert into message_bodies (message_id, body) values ($1, $2)`, [
      messageId,
      'a note that should never have flown',
    ]);

    const { rows: flightRows } = await db.query<{ id: string }>(
      `insert into flights (
         message_id, sender_id, recipient_id, pigeon_id,
         origin_lat, origin_lon, dest_lat, dest_lon,
         distance_km, initial_bearing_deg,
         departs_at, arrives_at, resolve_at, effective_speed_kmh, seed
       ) values (
         $1, $2, $3, $4,
         34.0522, -118.2437, 40.7128, -74.006,
         3935.8, 65.92,
         now() - interval '1 hour', now() - interval '1 minute',
         now() - interval '1 minute', 177.02784, 42
       ) returning id`,
      [messageId, fx.alice, fx.bob, wren],
    );
    const flightId = flightRows[0]!.id;
    await db.query(
      `insert into flight_secrets (flight_id, planned_outcome) values ($1, 'delivered')`,
      [flightId],
    );

    await db.query(`select public.resolve_due_flights()`);

    const { rows } = await db.query<{
      is_alive: boolean;
      died_at: string;
    }>(`select is_alive, died_at from pigeons where id = $1`, [wren]);

    expect(rows[0]!.is_alive).toBe(false);
    expect(new Date(rows[0]!.died_at).toISOString()).toBe(new Date(originalDeath).toISOString());
  });
});
