import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PublicFlight, Viewport } from '@pidge/flight-sim';

import type { ResolutionDeps } from '../../data/resolution-deps';
import { t } from '../copy/strings';
import { COLORS } from '../theme/tokens';
import { FONT_FAMILIES, FONT_SIZES } from '../theme/typography';
import { sharedStyles } from '../theme/styles';
import { FlightScreen } from './FlightScreen';

/** Same polling cadence as `ArrivalScreen` (`M1-21`): an immediate poll on
 * mount covers cold start, and this interval only matters for a flight that
 * resolves while the screen is already open. */
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
   * ever forwarded to `FlightScreen` while the flight has not resolved as
   * lost. */
  readonly now: () => number;
  readonly reducedMotion?: boolean;
}

type State = { readonly lost: false } | { readonly lost: true; readonly place: string; readonly time: string };

const NOT_LOST: State = { lost: false };

/**
 * `[M1-22]` The sender's memorial: the only screen anyone ever sees for a
 * flight that resolved as lost. Sits on top of `FlightScreen` (`M1-16`),
 * mirroring `ArrivalScreen`'s (`M1-21`) own shape exactly — the two are
 * symmetric opposites of the same resolution-watching pattern. Renders
 * `FlightScreen` unchanged for as long as the flight is unresolved *or*
 * resolves as `'delivered'`: a successful flight is not this screen's
 * concern (`docs/PRODUCT.md` §8/INV-2 mean the sender's own success state
 * lives elsewhere), so `'delivered'` is treated identically to "still
 * unresolved" here — the exact mirror of `ArrivalScreen` treating `'died'`
 * identically to "still unresolved" on the recipient's side. Only a
 * `'died'` result swaps this screen to the memorial, and only once: name,
 * place, time, and that the note was not recovered — the note's text is
 * never read from the result at all in that branch, so it structurally
 * cannot leak here even if a result somehow carried one.
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
  const [state, setState] = useState<State>(NOT_LOST);

  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    // Reset before polling starts, not just when a poll resolves: reusing
    // this component across two different flights (a fresh `flightId`, no
    // remount) must never keep showing the previous flight's memorial while
    // the new one is still unresolved.
    setState(NOT_LOST);

    let settled = false;
    const id = setInterval(runPoll, POLL_MS);

    function runPoll(): void {
      depsRef.current.poll(flightId).then(
        (result) => {
          if (settled || result === null || result.outcome !== 'died' || result.place === null || result.time === null) return;
          settled = true;
          clearInterval(id);
          setState({ lost: true, place: result.place, time: result.time });
        },
        () => {
          // `realResolutionDeps` rejects honestly while there is nothing
          // live to poll yet (`M1-11`, blocked on Q-002). Swallowed rather
          // than crashing: this screen genuinely does not know whether the
          // flight resolved, so it stays on `FlightScreen` — the same
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

  if (state.lost) {
    return (
      <View style={sharedStyles.screen} testID="loss-screen">
        <Text style={styles.body}>{t({ key: 'death', birdName, place: state.place, time: state.time })}</Text>
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
  body: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILIES.dispatch,
    fontSize: FONT_SIZES.body,
  },
});
