import { useEffect, useRef, useState } from 'react';

import type { ResolutionDeps, ResolutionResult } from './resolution-deps';

/** How often to poll while unresolved. An immediate poll on mount (below)
 * covers the cold-start case; this interval only matters for a flight that
 * resolves while the screen is already open, and must stay well under the
 * 2-second reveal budget `ArrivalScreen`'s and `LossScreen`'s own acceptance
 * criteria set. */
const POLL_MS = 1000;

/**
 * Shared polling mechanism behind `ArrivalScreen` (`M1-21`) and `LossScreen`
 * (`M1-22`) — extracted during the HARDENING pass their own journal entries
 * (iterations 38/39) flagged this duplication for, once both screens existed
 * and the ~30-line polling `useEffect` had been written twice with only the
 * outcome discriminant differing.
 *
 * Polls `deps.poll(flightId)` immediately on mount (covers cold start — an
 * already-resolved flight settles on the caller's very first render with no
 * transitional unresolved frame) and every `POLL_MS` thereafter, stopping the
 * moment `extract` returns a non-null value. Resets to `null` whenever
 * `flightId` changes, before the new poll starts, so a caller that reuses one
 * mounted instance across two different flights never keeps showing the
 * previous flight's revealed value over a new, unresolved one.
 *
 * `extract` decides both *which* outcome this caller cares about and *what*
 * it needs from a matching result — `ArrivalScreen` only reveals on
 * `'delivered'` (treating `'died'` as still-unresolved, since the recipient
 * must never learn a lost message existed), `LossScreen` only on `'died'`
 * (treating `'delivered'` as still-unresolved, since a successful flight is
 * not the sender's memorial screen's concern). A rejected poll —
 * `realResolutionDeps`'s honest placeholder while no live backend exists yet
 * (`M1-11`, blocked on Q-002) — is swallowed the same way in both cases: the
 * caller genuinely does not know whether the flight has resolved, so it
 * keeps polling rather than crashing or leaking a fake outcome.
 */
export function useResolutionPoll<T>(
  deps: ResolutionDeps,
  flightId: string,
  extract: (result: ResolutionResult) => T | null,
): T | null {
  const [revealed, setRevealed] = useState<T | null>(null);

  const depsRef = useRef(deps);
  depsRef.current = deps;
  const extractRef = useRef(extract);
  extractRef.current = extract;

  useEffect(() => {
    setRevealed(null);

    let settled = false;
    const id = setInterval(runPoll, POLL_MS);

    function runPoll(): void {
      depsRef.current.poll(flightId).then(
        (result) => {
          if (settled || result === null) return;
          const value = extractRef.current(result);
          if (value === null) return;
          settled = true;
          clearInterval(id);
          setRevealed(value);
        },
        () => {
          // See the doc comment above: an honest "nothing live yet"
          // rejection is not a resolution, so it changes nothing here.
        },
      );
    }

    runPoll();
    return () => {
      settled = true;
      clearInterval(id);
    };
  }, [flightId]);

  return revealed;
}
