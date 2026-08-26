import type { FlightPlan, LatLng, PlanInput } from '../../../packages/flight-sim/src/index';

/**
 * The one place a note's length is enforced before anything is written.
 * Mirrors `message_bodies`' own `check (length(body) between 1 and 280)` in
 * `supabase/migrations/0002_messaging.sql` and PRODUCT.md §6 — kept here too
 * so a bird is never allowed to take off first only to be refused by the
 * database, and so the check runs before any query touches it at all.
 */
export const MAX_MESSAGE_LENGTH = 280;

export interface ReleaseRequestBody {
  readonly conversationId: string;
  readonly recipientId: string;
  readonly pigeonId: string | null;
  readonly body: string;
  /**
   * A client may send these — the request type used to decode an arbitrary
   * JSON body allows it — but none of them is ever read. Origin, destination
   * and departure time are the server's alone; see the Do NOT list on M1-02.
   */
  readonly departsAtMs?: unknown;
  readonly originLat?: unknown;
  readonly originLon?: unknown;
  readonly destLat?: unknown;
  readonly destLon?: unknown;
}

export interface ReleaseArgs {
  readonly conversationId: string;
  readonly senderId: string;
  readonly recipientId: string;
  readonly pigeonId: string | null;
  readonly body: string;
  readonly plan: FlightPlan;
  /**
   * `FlightPlan` carries only the rolled result, not the seed that produced
   * it — but `release_pigeon` must store the seed itself (INV-4: fate is
   * reproducible forever from `(inputs, seed)`), so it has to travel
   * alongside the plan rather than be re-derived from it.
   */
  readonly seed: number;
}

export interface ReleaseDeps {
  /** The one and only flight-physics implementation — see ADR-001. */
  readonly planFlight: (input: PlanInput) => FlightPlan;
  /** Epoch ms. The server's clock, never the client's. */
  readonly now: () => number;
  /** A fresh per-flight seed. See INV-4. */
  readonly generateSeed: () => number;
  /**
   * Resolves the caller's own id from the request's credentials — never from
   * the request body. `release_pigeon` is revoked from `authenticated`
   * (see `supabase/migrations/0006_release_guards.sql`), so this adapter is
   * the only thing standing between an arbitrary JSON body and a call made
   * with the service role. Returns `null` for a missing or invalid credential.
   */
  readonly authenticate: (authorizationHeader: string | null) => Promise<string | null>;
  /** A user's stored, already-snapped loft coordinates (INV-7). `null` if unset. */
  readonly getLoft: (userId: string) => Promise<LatLng | null>;
  /**
   * The ids of every member of a conversation. `release_pigeon` trusts
   * whatever sender/recipient it is given — it is reachable only through
   * this adapter (see `authenticate` above) — so this is the one check
   * standing between an authenticated user and forging a flight into a
   * conversation, or to a recipient, they have no relationship to at all.
   */
  readonly getConversationMemberIds: (conversationId: string) => Promise<readonly string[]>;
  /** Writes the flight down via the `release_pigeon` RPC. */
  readonly releasePigeon: (args: ReleaseArgs) => Promise<{ readonly flightId: string }>;
}

export interface ReleaseResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * The Edge Function's business logic. Deliberately not a network handler —
 * `index.ts` is the thin Deno adapter that parses a real `Request`, builds
 * the real `ReleaseDeps`, and turns this into a `Response`. Keeping this
 * function's inputs and outputs plain data is what lets it run under Jest
 * with a stubbed Supabase client instead of a live one.
 */
export async function handleRelease(
  authorizationHeader: string | null,
  payload: ReleaseRequestBody,
  deps: ReleaseDeps,
): Promise<ReleaseResult> {
  if (!isNonEmptyString(payload.body) || payload.body.length > MAX_MESSAGE_LENGTH) {
    return { status: 400, body: { error: 'body must be between 1 and 280 characters' } };
  }
  if (!isNonEmptyString(payload.conversationId) || !isNonEmptyString(payload.recipientId)) {
    return { status: 400, body: { error: 'conversationId and recipientId are required' } };
  }
  if (payload.pigeonId !== null && !isNonEmptyString(payload.pigeonId)) {
    return { status: 400, body: { error: 'pigeonId must be a string or null' } };
  }

  const senderId = await deps.authenticate(authorizationHeader);
  if (senderId === null) {
    return { status: 401, body: { error: 'unauthenticated' } };
  }

  const memberIds = await deps.getConversationMemberIds(payload.conversationId);
  if (!memberIds.includes(senderId) || !memberIds.includes(payload.recipientId)) {
    return { status: 403, body: { error: 'sender and recipient must both belong to the conversation' } };
  }

  const [origin, destination] = await Promise.all([
    deps.getLoft(senderId),
    deps.getLoft(payload.recipientId),
  ]);
  if (origin === null) {
    return { status: 422, body: { error: 'sender has not set a loft' } };
  }
  if (destination === null) {
    return { status: 422, body: { error: 'recipient has not set a loft' } };
  }

  // The server owns the clock and the seed; nothing in `payload` reaches
  // `planFlight` beyond the note text and the two ids already validated above.
  //
  // `isFirstEverFlight` is deliberately not set here — computing "has this
  // sender ever released before" needs a query this item's Do list never
  // asked for, and `planFlight` already defaults it to `false` (the safe
  // side: a flight that should never die still can't). Filed as M1-10 so a
  // real user's tutorial bird is not silently exposed to risk PRODUCT.md §6
  // says it must never carry.
  const seed = deps.generateSeed();
  const plan = deps.planFlight({
    origin,
    destination,
    departsAtMs: deps.now(),
    seed,
  });

  const { flightId } = await deps.releasePigeon({
    conversationId: payload.conversationId,
    senderId,
    recipientId: payload.recipientId,
    pigeonId: payload.pigeonId,
    body: payload.body,
    plan,
    seed,
  });

  return {
    status: 200,
    body: { flightId, arrivesAtMs: plan.pub.arrivesAtMs, distanceKm: plan.pub.distanceKm },
  };
}
