import { StyleSheet, Text, View } from 'react-native';
import type { PublicFlight, Viewport } from '@pidge/flight-sim';

import type { ResolutionDeps } from '../../data/resolution-deps';
import { useResolutionPoll } from '../../data/use-resolution-poll';
import { t } from '../copy/strings';
import { COLORS } from '../theme/tokens';
import { FONT_FAMILIES, FONT_SIZES } from '../theme/typography';
import { sharedStyles } from '../theme/styles';
import { FlightScreen } from './FlightScreen';

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
  const memorial = useResolutionPoll(deps, flightId, (result) =>
    result.outcome === 'died' && result.place !== null && result.time !== null
      ? { place: result.place, time: result.time }
      : null,
  );

  if (memorial !== null) {
    return (
      <View style={sharedStyles.screen} testID="loss-screen">
        <Text style={styles.body}>{t({ key: 'death', birdName, place: memorial.place, time: memorial.time })}</Text>
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
