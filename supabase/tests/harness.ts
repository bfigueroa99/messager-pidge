import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const ROOT = join(__dirname, '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const SHIMS_DIR = join(ROOT, 'supabase', 'tests', 'shims');

export type Row = Record<string, unknown>;

/**
 * A real Postgres (compiled to WASM, in-process) with the real migrations
 * applied. Docker is unavailable in this container, so `supabase start` is not
 * an option; PGlite is what makes the RLS suite runnable at all.
 */
export async function freshDb(): Promise<PGlite> {
  const db = new PGlite();

  await db.exec(readFileSync(join(SHIMS_DIR, '00_pre.sql'), 'utf8'));

  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    } catch (err) {
      throw new Error(`migration ${file} failed: ${(err as Error).message}`);
    }
  }

  return db;
}

/**
 * Run a query as a signed-in user, with RLS in force.
 *
 * PGlite connects as a superuser, who bypasses RLS entirely — so every query
 * that is meant to be checked MUST go through here. A test that calls
 * `db.query` directly is testing nothing.
 */
export async function asUser<T = Row>(
  db: PGlite,
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.exec(`set role authenticated;`);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ]);
  try {
    const res = await db.query<T>(sql, params);
    return res.rows;
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claims', null, false);`);
  }
}

/** Run as an anonymous visitor — signed out, no claims at all. */
export async function asAnon<T = Row>(
  db: PGlite,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.exec(`set role anon; select set_config('request.jwt.claims', null, false);`);
  try {
    const res = await db.query<T>(sql, params);
    return res.rows;
  } finally {
    await db.exec(`reset role;`);
  }
}

export interface Fixture {
  alice: string;
  bob: string;
  carol: string;
  conversationId: string;
}

/** Two correspondents, one thread, and a stranger. */
export async function seedUsers(db: PGlite): Promise<Fixture> {
  const mk = async (handle: string, name: string): Promise<string> => {
    const { rows } = await db.query<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [`${handle}@example.test`],
    );
    const id = rows[0]!.id;
    await db.query(
      `insert into profiles (id, handle, display_name, home_lat, home_lon) values ($1,$2,$3,$4,$5)`,
      [id, handle, name, null, null],
    );
    return id;
  };

  const alice = await mk('alice', 'Alice');
  const bob = await mk('bob', 'Bob');
  const carol = await mk('carol', 'Carol');

  const dmKey = [alice, bob].sort().join(':');
  const { rows } = await db.query<{ id: string }>(
    `insert into conversations (dm_key) values ($1) returning id`,
    [dmKey],
  );
  const conversationId = rows[0]!.id;

  await db.query(
    `insert into conversation_members (conversation_id, user_id) values ($1,$2), ($1,$3)`,
    [conversationId, alice, bob],
  );

  return { alice, bob, carol, conversationId };
}

const LAX = { lat: 34.0522, lon: -118.2437 };
const NYC = { lat: 40.7128, lon: -74.006 };

export interface ReleaseOptions {
  outcome?: 'delivered' | 'died';
  durationMs?: number;
  deathFraction?: number;
  body?: string;
}

/** Release a bird from Alice to Bob via the real `release_pigeon` function. */
export async function release(
  db: PGlite,
  fx: Fixture,
  opts: ReleaseOptions = {},
): Promise<string> {
  const outcome = opts.outcome ?? 'delivered';
  const durationMs = opts.durationMs ?? 22 * 3_600_000;
  const { rows } = await db.query<{ release_pigeon: string }>(
    `select public.release_pigeon(
       $1,$2,$3,$4,
       $5,$6,$7,$8,
       $9,$10,$11,$12,$13,
       $14::flight_outcome,$15,$16,$17,$18::death_cause
     ) as release_pigeon`,
    [
      fx.conversationId,
      fx.alice,
      fx.bob,
      opts.body ?? 'the coffee here is bad and I think about you constantly',
      LAX.lat,
      LAX.lon,
      NYC.lat,
      NYC.lon,
      3935.8,
      65.92,
      177.02784,
      durationMs,
      42,
      outcome,
      outcome === 'died' ? (opts.deathFraction ?? 0.5) : null,
      outcome === 'died' ? 39.51 : null,
      outcome === 'died' ? -97.16 : null,
      outcome === 'died' ? 'hawk' : null,
    ],
  );
  return rows[0]!.release_pigeon;
}

/** Drag a flight's timeline into the past so its moment has come. */
export async function rewind(db: PGlite, flightId: string, byMs: number): Promise<void> {
  await db.query(
    `update flights
        set departs_at = departs_at - make_interval(secs => $2 / 1000.0),
            arrives_at = arrives_at - make_interval(secs => $2 / 1000.0),
            resolve_at = resolve_at - make_interval(secs => $2 / 1000.0)
      where id = $1`,
    [flightId, byMs],
  );
  await db.query(
    `update flight_secrets s
        set death_at = s.death_at - make_interval(secs => $2 / 1000.0)
      where s.flight_id = $1 and s.death_at is not null`,
    [flightId, byMs],
  );
}
