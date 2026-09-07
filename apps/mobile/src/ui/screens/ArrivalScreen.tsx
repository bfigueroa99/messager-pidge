import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PublicFlight, Viewport } from '@pidge/flight-sim';

import type { ResolutionDeps } from '../../data/resolution-deps';
import { t } from '../copy/strings';
import { COLORS, SPACING } from '../theme/tokens';
import { FONT_FAMILIES, FONT_SIZES } from '../theme/typography';
import { sharedStyles } from '../theme/styles';
import { FlightScreen } from './FlightScreen';

/** How often to poll while unresolved. An immediate poll on mount (below)
 * covers the cold-start case; this interval only matters for a flight that
 * resolves while the screen is already open, and must stay well under the
 * 2-second reveal budget the acceptance criterion sets. */
const POLL_MS = 1000;

export interface ArrivalScreenProps {
  readonly deps: ResolutionDeps;
  readonly flightId: string;
  readonly flight: PublicFlight;
  readonly originName: string;
  readonly destinationName: string;
  readonly senderName: string;
  readonly viewport: Viewport;
  readonly unit?: 'imperial' | 'metric';
  /** The current time, in epoch ms — same contract as `FlightScreen`'s own
   * required `now` prop. Never read directly by this component; it is only
   * ever forwarded to `FlightScreen` while unresolved. */
  readonly now: () => number;
  readonly reducedMotion?: boolean;
}

type State = { readonly revealed: false } | { readonly revealed: true; readonly body: string };

const UNRESOLVED: State = { revealed: false };

/**
 * `[M1-21]` The recipient's arrival-reveal scene. Sits on top of `FlightScreen`
 * (`M1-16`): renders it unchanged while unresolved, and swaps to the reveal
 * once — and only once — `deps.poll` returns a `'delivered'` result. There is
 * no entry animation for either state; a cold start after resolution polls
 * immediately on mount, so an already-resolved flight reveals on this
 * component's very first settled render rather than showing the in-flight
 * screen first and animating into the reveal.
 *
 * A `'died'` result is never surfaced here — `docs/PRODUCT.md` §8/INV-2 mean
 * the recipient never learns a lost message existed at all, so this screen
 * simply keeps rendering `FlightScreen` in that case (mirroring the server's
 * own behaviour: RLS never lets a doomed flight's outcome reach the
 * recipient, so a real `poll` would not return `'died'` here in the first
 * place — this is a defensive mirror of that guarantee, not a path expected
 * to fire against the real backend once `M1-11` wires one in).
 */
export function ArrivalScreen({
  deps,
  flightId,
  flight,
  originName,
  destinationName,
  senderName,
  viewport,
  unit = 'imperial',
  now,
  reducedMotion,
}: ArrivalScreenProps) {
  const [state, setState] = useState<State>(UNRESOLVED);

  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    // Reset before polling starts, not just when a poll resolves: a caller
    // that reuses this component across two different flights (a fresh
    // `flightId`, no remount) must never keep showing the previous flight's
    // reveal while the new one is still unresolved.
    setState(UNRESOLVED);

    let settled = false;
    const id = setInterval(runPoll, POLL_MS);

    function runPoll(): void {
      depsRef.current.poll(flightId).then(
        (result) => {
          if (settled || result === null || result.outcome !== 'delivered' || result.body === null) return;
          settled = true;
          clearInterval(id);
          setState({ revealed: true, body: result.body });
        },
        () => {
          // `realResolutionDeps` rejects honestly while there is nothing
          // live to poll yet (`M1-11`, blocked on Q-002). Swallowed rather
          // than crashing: this screen genuinely does not know whether the
          // flight has resolved, so it stays on `FlightScreen` — the same
          // "no fake success" precedent the other placeholder deps set.
        },
      );
    }

    runPoll();
    return () => {
      settled = true;
      clearInterval(id);
    };
  }, [flightId]);

  if (state.revealed) {
    return (
      <View style={sharedStyles.screen} testID="arrival-screen">
        <Text style={styles.headline}>{t({ key: 'arrival', senderName })}</Text>
        <Text style={styles.body}>{state.body}</Text>
      </View>
    );
  }

  return (
    <FlightScreen
      flight={flight}
      originName={originName}
      destinationName={destinationName}
      viewport={viewport}
      unit={unit}
      now={now}
      reducedMotion={reducedMotion}
    />
  );
}

const styles = StyleSheet.create({
  headline: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILIES.dispatch,
    fontSize: FONT_SIZES.title2,
    marginBottom: SPACING.md,
  },
  body: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILIES.dispatch,
    fontSize: FONT_SIZES.body,
  },
});
