import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PublicFlight, Viewport } from '@pidge/flight-sim';

import type { ResolutionDeps } from '../../data/resolution-deps';
import { t } from '../copy/strings';
import { COLORS } from '../theme/tokens';
import { FONT_FAMILIES, FONT_SIZES } from '../theme/typography';
import { sharedStyles } from '../theme/styles';
import { FlightScreen } from './FlightScreen';

/** Mirrors `ArrivalScreen`'s (`M1-21`) `POLL_MS`: an immediate poll on mount
 * covers cold start, this interval covers a resolution that arrives while
 * the screen is already open. */
const POLL_MS = 1000;

export interface LossScreenProps {
  readonly deps: ResolutionDeps;
  readonly flightId: string;
  readonly flight: PublicFlight;
  readonly originName: string;
  readonly destinationName: string;
  readonly birdName: string;
  readonly viewport: Viewport;
  readonly unit?: 'imperial' | 'metric';
  /** The current time, in epoch ms — same contract as `FlightScreen`'s own
   * required `now` prop. Never read directly by this component; it is only
   * ever forwarded to `FlightScreen` while unresolved. */
  readonly now: () => number;
  readonly reducedMotion?: boolean;
}

type State = { readonly revealed: false } | { readonly revealed: true; readonly place: string; readonly time: string };

const UNRESOLVED: State = { revealed: false };

/**
 * `[M1-22]` The sender's loss/memorial screen. Sits on top of `FlightScreen`
 * (`M1-16`), mirroring `ArrivalScreen` (`M1-21`): renders it unchanged while
 * unresolved, and swaps to the memorial once — and only once — `deps.poll`
 * returns a `'died'` result. `docs/PRODUCT.md` §5's death copy names the
 * bird, the place, and the time, and never the note's text — the server has
 * already hard-deleted it (`M0-05`/`M0-09`), so `ResolutionResult` never
 * carries a body for a `'died'` outcome and this screen never has one to
 * render even by mistake.
 *
 * A `'delivered'` result is never surfaced here — this screen only exists to
 * show the sender a loss. There is no cold-start replay: a poll on mount
 * covers a flight that already resolved as lost before this screen ever
 * mounted, so the memorial renders on the very first settled render rather
 * than showing the in-flight screen first.
 */
export function LossScreen({
  deps,
  flightId,
  flight,
  originName,
  destinationName,
  birdName,
  viewport,
  unit = 'imperial',
  now,
  reducedMotion,
}: LossScreenProps) {
  const [state, setState] = useState<State>(UNRESOLVED);

  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    // Reset before polling starts, not just when a poll resolves: a caller
    // that reuses this component across two different flights (a fresh
    // `flightId`, no remount) must never keep showing the previous flight's
    // memorial while the new one is still unresolved.
    setState(UNRESOLVED);

    let settled = false;
    const id = setInterval(runPoll, POLL_MS);

    function runPoll(): void {
      depsRef.current.poll(flightId).then(
        (result) => {
          if (settled || result === null || result.outcome !== 'died' || result.place === null || result.time === null) {
            return;
          }
          settled = true;
          clearInterval(id);
          setState({ revealed: true, place: result.place, time: result.time });
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
      <View style={sharedStyles.screen} testID="loss-screen">
        <Text style={styles.headline}>{t({ key: 'death', birdName, place: state.place, time: state.time })}</Text>
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
  },
});
