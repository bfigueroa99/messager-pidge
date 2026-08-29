import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { flightStateAt, formatDistance, formatEta, type PublicFlight } from '@pidge/flight-sim';

import { COLORS, SPACING } from '../theme/tokens';
import { FONT_FAMILIES, FONT_SIZES } from '../theme/typography';

const TICK_MS = 1000;

export interface FlightCardProps {
  readonly flight: PublicFlight;
  readonly originName: string;
  readonly destinationName: string;
  readonly unit?: 'imperial' | 'metric';
  /** The current time, in epoch ms. Required rather than defaulted to
   * `Date.now` — `flightStateAt`'s own docstring is explicit that this must
   * come from the server-corrected clock, never the device's, so a caller
   * has to decide what "now" means rather than silently inheriting a device
   * clock that can be wrong or manually set. */
  readonly now: () => number;
}

/**
 * `[M1-04]` Pure presentation over `flightStateAt`/`formatEta`/`formatDistance` —
 * it takes props and computes, it never fetches. Ticks once a second via
 * `setInterval` rather than every frame, so the countdown reads as a clock,
 * not an animation.
 */
export function FlightCard({ flight, originName, destinationName, unit = 'imperial', now }: FlightCardProps) {
  const [nowMs, setNowMs] = useState(() => now());

  // The interval is created once and never torn down for the life of the
  // component — reading `now` through a ref, rather than depending on it,
  // means a caller passing an inline `now={() => ...}` (a new function
  // identity every render) never causes the effect to restart before its
  // own 1000ms has elapsed, which would otherwise freeze the countdown.
  const nowRef = useRef(now);
  nowRef.current = now;

  useEffect(() => {
    const id = setInterval(() => setNowMs(nowRef.current()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const state = flightStateAt(flight, nowMs);

  return (
    <View style={styles.card}>
      <Text style={styles.route}>
        {originName} → {destinationName}
      </Text>
      <Text style={styles.eta}>🕊 {formatEta(state.remainingMs)}</Text>
      <Text style={styles.distance}>{formatDistance(flight.distanceKm, unit)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.paper,
    padding: SPACING.md,
    borderRadius: 8,
  },
  route: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILIES.dispatch,
    fontSize: FONT_SIZES.footnote,
    marginBottom: SPACING.xs,
  },
  eta: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILIES.numeric,
    fontSize: FONT_SIZES.title2,
  },
  distance: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILIES.numeric,
    fontSize: FONT_SIZES.body,
  },
});
