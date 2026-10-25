// Deno entry point. Runs as a Supabase Edge Function — see ADR-001 and M1-02.
//
// All business logic lives in handler.ts, which is plain TypeScript tested
// under Jest with a stubbed ReleaseDeps. This file's only job is to build a
// real ReleaseDeps (a live Supabase client, the server clock, a real seed)
// and turn Deno's Request/Response into handleRelease's plain-data shape.
//
// `release_pigeon` is revoked from `authenticated` (see
// supabase/migrations/0006_release_guards.sql) — only the service role can
// call it — which is why this adapter authenticates the caller itself
// (deps.authenticate) before ever touching the database with that elevated
// credential. Do not remove that check to "simplify" this file.
import { createClient } from 'npm:@supabase/supabase-js@2';

// planFlight is imported from the committed bundle (`pnpm run build:engine`),
// not from `@pidge/flight-sim` directly — Deno cannot resolve a pnpm
// workspace package, and this keeps the flight math to exactly one
// implementation. See scripts/build-engine.mjs and ADR-010.
import { planFlight } from '../_shared/flight-sim.js';
import { handleRelease } from './handler.ts';
import type { ReleaseArgs, ReleaseDeps } from './handler.ts';

// Deno is not declared anywhere Node/Jest can see, on purpose — this file is
// never imported by a test. The shape below is only what this file calls.
declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (name: string) => string | undefined };
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(supabaseUrl, serviceRoleKey);

function randomSeed(): number {
  // A flight's fate must be reproducible forever from this one value (INV-4),
  // but the value itself only needs to be unpredictable at roll time — a
  // single 32-bit draw, matching the range mulberry32 actually uses
  // (packages/flight-sim/src/rng.ts masks every seed with `>>> 0`).
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

const deps: ReleaseDeps = {
  planFlight,
  now: () => Date.now(),
  generateSeed: randomSeed,

  async authenticate(authorizationHeader) {
    if (authorizationHeader === null) return null;
    const jwt = authorizationHeader.replace(/^Bearer\s+/i, '');
    if (jwt.length === 0) return null;
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data.user) return null;
    return data.user.id;
  },

  async getLoft(userId) {
    const { data, error } = await admin
      .from('profiles')
      .select('home_lat, home_lon')
      .eq('id', userId)
      .single();
    if (error || data === null || data.home_lat === null || data.home_lon === null) return null;
    return { lat: data.home_lat, lon: data.home_lon };
  },

  async getConversationMemberIds(conversationId) {
    const { data, error } = await admin
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', conversationId);
    if (error || data === null) return [];
    return data.map((row: { user_id: string }) => row.user_id);
  },

  async hasEverReleased(userId) {
    // On a query error, fail toward the safe side of the invariant: treat the
    // user as already having released, so `isFirstEverFlight` comes out
    // `false` (normal risk) rather than incorrectly granting death-immunity.
    // A flight that should never die still can't; the reverse is not true.
    const { data, error } = await admin.from('flights').select('id').eq('sender_id', userId).limit(1);
    if (error || data === null) return true;
    return data.length > 0;
  },

  async releasePigeon(args: ReleaseArgs) {
    const { plan } = args;
    const { data, error } = await admin.rpc('release_pigeon', {
      p_conversation_id: args.conversationId,
      p_sender_id: args.senderId,
      p_recipient_id: args.recipientId,
      p_body: args.body,
      p_origin_lat: plan.pub.origin.lat,
      p_origin_lon: plan.pub.origin.lon,
      p_dest_lat: plan.pub.destination.lat,
      p_dest_lon: plan.pub.destination.lon,
      p_distance_km: plan.pub.distanceKm,
      p_bearing_deg: plan.pub.initialBearingDeg,
      p_speed_kmh: plan.pub.effectiveSpeedKmh,
      p_duration_ms: plan.pub.arrivesAtMs - plan.pub.departsAtMs,
      p_seed: args.seed,
      p_outcome: plan.secret.outcome,
      p_death_fraction: plan.secret.deathFraction,
      p_death_lat: plan.secret.deathPoint?.lat ?? null,
      p_death_lon: plan.secret.deathPoint?.lon ?? null,
      p_cause: plan.secret.cause,
      p_pigeon_id: args.pigeonId,
      p_sim_version: plan.pub.simVersion,
    });
    if (error || !data) throw new Error(error?.message ?? 'release_pigeon returned no id');
    return { flightId: data as string };
  },
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
  }
  try {
    const payload = await req.json();
    const result = await handleRelease(req.headers.get('Authorization'), payload, deps);
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    // Malformed JSON, or a dependency (release_pigeon's RPC, most likely)
    // rejecting an input handleRelease's own checks let through — e.g. a
    // pigeonId that is a non-empty string but not a valid uuid. This
    // boundary covers several unrelated failure classes, so its message
    // stays generic rather than naming one of them (a loft, specifically)
    // as though it were the cause every time it fires. Either way this must
    // not leak the underlying error text to the caller.
    return new Response(JSON.stringify({ error: 'the release could not be completed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
});
