import { handleRelease, MAX_MESSAGE_LENGTH } from './handler';
import type { ReleaseArgs, ReleaseDeps, ReleaseRequestBody } from './handler';
import type { FlightPlan, LatLng, PlanInput } from '../../../packages/flight-sim/src/index';

/**
 * `[M1-02]` `handleRelease` is the Edge Function's business logic, kept as
 * plain data-in/data-out TypeScript (see handler.ts's own doc comment) so it
 * can be exercised here with a stubbed `ReleaseDeps` instead of a live
 * Supabase project and a real Deno runtime — neither of which exists in this
 * container.
 */

const SENDER_LOFT: LatLng = { lat: 34.0522, lon: -118.2437 }; // Los Angeles
const RECIPIENT_LOFT: LatLng = { lat: 40.7128, lon: -74.006 }; // New York
const SERVER_NOW_MS = 1_700_000_000_000;

function stubPlan(input: PlanInput): FlightPlan {
  return {
    pub: {
      origin: input.origin,
      destination: input.destination,
      departsAtMs: input.departsAtMs,
      arrivesAtMs: input.departsAtMs + 1_000,
      distanceKm: 3936,
      initialBearingDeg: 66,
      effectiveSpeedKmh: 177.02784,
      simVersion: 1,
    },
    secret: {
      outcome: 'delivered',
      deathAtMs: null,
      deathFraction: null,
      deathPoint: null,
      cause: null,
      resolveAtMs: input.departsAtMs + 1_000,
    },
  };
}

function makeDeps(overrides: Partial<ReleaseDeps> = {}): ReleaseDeps {
  return {
    planFlight: stubPlan,
    now: () => SERVER_NOW_MS,
    generateSeed: () => 42,
    authenticate: async () => 'sender-1',
    getLoft: async (userId: string) => (userId === 'sender-1' ? SENDER_LOFT : RECIPIENT_LOFT),
    getConversationMemberIds: async () => ['sender-1', 'recipient-1'],
    hasEverReleased: async () => false,
    releasePigeon: async () => ({ flightId: 'flight-1' }),
    ...overrides,
  };
}

const BASE_PAYLOAD: ReleaseRequestBody = {
  conversationId: 'convo-1',
  recipientId: 'recipient-1',
  pigeonId: 'pigeon-1',
  body: 'Over Nebraska. Holding against a headwind.',
};

function fail(message: string): never {
  throw new Error(message);
}

describe('handleRelease', () => {
  it('[M1-02] the handler rejects a body longer than 280 characters before touching the database', async () => {
    const deps = makeDeps({
      authenticate: async () => fail('must not authenticate a rejected request'),
      getLoft: async () => fail('must not resolve a loft for a rejected request'),
      releasePigeon: async () => fail('must not release for a rejected request'),
    });

    const result = await handleRelease(
      null,
      { ...BASE_PAYLOAD, body: 'x'.repeat(MAX_MESSAGE_LENGTH + 1) },
      deps,
    );

    expect(result.status).toBe(400);
  });

  it('[M1-02] the handler ignores a client-supplied departure time', async () => {
    let seenInput: PlanInput | null = null;
    const deps = makeDeps({
      planFlight: (input: PlanInput) => {
        seenInput = input;
        return stubPlan(input);
      },
    });

    await handleRelease('Bearer sender-1-token', { ...BASE_PAYLOAD, departsAtMs: 1 }, deps);

    expect(seenInput?.departsAtMs).toBe(SERVER_NOW_MS);
  });

  it('[M1-02] the handler resolves the destination from the recipient stored loft, not from the request', async () => {
    let seenInput: PlanInput | null = null;
    const deps = makeDeps({
      planFlight: (input: PlanInput) => {
        seenInput = input;
        return stubPlan(input);
      },
    });

    await handleRelease(
      'Bearer sender-1-token',
      { ...BASE_PAYLOAD, destLat: 0, destLon: 0 },
      deps,
    );

    expect(seenInput?.destination).toEqual(RECIPIENT_LOFT);
    expect(seenInput?.origin).toEqual(SENDER_LOFT);
  });

  it('[M1-02] the handler derives the sender from the authenticated caller, not the request body', async () => {
    let seenArgs: ReleaseArgs | null = null;
    const deps = makeDeps({
      authenticate: async (header: string | null) => (header === 'Bearer sender-1-token' ? 'sender-1' : null),
      releasePigeon: async (args: ReleaseArgs) => {
        seenArgs = args;
        return { flightId: 'flight-1' };
      },
    });

    await handleRelease('Bearer sender-1-token', BASE_PAYLOAD, deps);

    expect(seenArgs?.senderId).toBe('sender-1');
  });

  it('[M1-02] the handler refuses an unauthenticated request before resolving a loft', async () => {
    const deps = makeDeps({
      authenticate: async () => null,
      getLoft: async () => fail('must not resolve a loft for an unauthenticated request'),
      releasePigeon: async () => fail('must not release for an unauthenticated request'),
    });

    const result = await handleRelease(null, BASE_PAYLOAD, deps);

    expect(result.status).toBe(401);
  });

  it('[M1-02] the handler refuses to release into a conversation the sender does not belong to', async () => {
    const deps = makeDeps({
      getConversationMemberIds: async () => ['recipient-1', 'someone-else'],
      getLoft: async () => fail('must not resolve a loft once conversation membership fails'),
      releasePigeon: async () => fail('must not release once conversation membership fails'),
    });

    const result = await handleRelease('Bearer sender-1-token', BASE_PAYLOAD, deps);

    expect(result.status).toBe(403);
  });

  it('[M1-02] the handler refuses to release to a recipient outside the conversation', async () => {
    const deps = makeDeps({
      getConversationMemberIds: async () => ['sender-1', 'someone-else'],
      releasePigeon: async () => fail('must not release to a recipient outside the conversation'),
    });

    const result = await handleRelease('Bearer sender-1-token', BASE_PAYLOAD, deps);

    expect(result.status).toBe(403);
  });

  it('[M1-10] a sender\'s first call to handleRelease passes isFirstEverFlight: true', async () => {
    let seenInput: PlanInput | null = null;
    const deps = makeDeps({
      hasEverReleased: async () => false,
      planFlight: (input: PlanInput) => {
        seenInput = input;
        return stubPlan(input);
      },
    });

    await handleRelease('Bearer sender-1-token', BASE_PAYLOAD, deps);

    expect(seenInput?.isFirstEverFlight).toBe(true);
  });

  it('[M1-10] a sender\'s second call to handleRelease passes isFirstEverFlight: false', async () => {
    let seenInput: PlanInput | null = null;
    const deps = makeDeps({
      hasEverReleased: async () => true,
      planFlight: (input: PlanInput) => {
        seenInput = input;
        return stubPlan(input);
      },
    });

    await handleRelease('Bearer sender-1-token', BASE_PAYLOAD, deps);

    expect(seenInput?.isFirstEverFlight).toBe(false);
  });

  it('[M1-02] the handler rejects an empty-string pigeonId before touching the database', async () => {
    const deps = makeDeps({
      authenticate: async () => fail('must not authenticate a rejected request'),
      releasePigeon: async () => fail('must not release for a rejected request'),
    });

    const result = await handleRelease('Bearer sender-1-token', { ...BASE_PAYLOAD, pigeonId: '' }, deps);

    expect(result.status).toBe(400);
  });
});
