import type { FlightOutcome } from '@pidge/flight-sim';

/**
 * What a resolved flight reveals — never a moment before the flight has
 * actually resolved (INV-5). `body` is present only when
 * `outcome === 'delivered'`: INV-2 means a died flight's note is destroyed
 * server-side and never reaches any client, sender included, so `body` is
 * always `null` for `'died'`. `place`/`time` are the mirror image — present
 * only for `'died'`, feeding the sender's memorial copy
 * (`t({ key: 'death', place, time, ... })`, `docs/PRODUCT.md` §5) — always
 * `null` for `'delivered'`.
 */
export interface ResolutionResult {
  readonly outcome: FlightOutcome;
  readonly body: string | null;
  readonly place: string | null;
  readonly time: string | null;
}

export interface ResolutionDeps {
  /**
   * Polls once for a flight's resolution. Resolves to `null` — never a
   * body, an outcome, or even the fact that resolution is close — for any
   * flight that has not resolved yet. Only ever returns a non-null
   * `ResolutionResult` once the flight has actually resolved server-side.
   * INV-5 is enforced by RLS gated on `now()`
   * (`supabase/migrations/0007_visibility_ignores_reaper.sql`); this
   * contract cannot leak the secret early no matter how often or how
   * eagerly a caller polls it.
   */
  poll(flightId: string): Promise<ResolutionResult | null>;
}

/**
 * No live Supabase project exists in this container (Q-002 in
 * `docs/QUESTIONS.md`) and no Supabase client has been wired into the mobile
 * app yet (`M1-11`, blocked on the same question), so there is nothing live
 * to poll. Matches the honest-placeholder precedent `realComposeDeps`/
 * `realLoftPickerDeps` already set: every poll rejects rather than silently
 * returning `null` forever, which would read as "still waiting" instead of
 * "cannot reach the loft".
 */
export const realResolutionDeps: ResolutionDeps = {
  poll() {
    return Promise.reject(new Error('no Supabase client wired into the mobile app yet — see M1-11'));
  },
};

/**
 * A deterministic test double for `M1-21`/`M1-22`'s own tests. `poll`
 * returns `null` for every call before `now() >= resolveAtMs`, then
 * `result` for every call at or after it — driven by the same injected
 * `now: () => number` clock `FlightScreen`/`FlightCard` already take, never
 * a real timer, so a test drives a flight from unresolved to resolved by
 * advancing the fake clock between polls rather than waiting out a real
 * interval.
 */
export function createFakeResolutionDeps(options: {
  readonly resolveAtMs: number;
  readonly result: ResolutionResult;
  readonly now: () => number;
}): ResolutionDeps {
  const { resolveAtMs, result, now } = options;
  return {
    poll() {
      return Promise.resolve(now() >= resolveAtMs ? result : null);
    },
  };
}
