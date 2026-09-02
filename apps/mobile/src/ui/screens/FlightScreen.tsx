import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  arcSegments,
  flightStateAt,
  projectPoint,
  projectSegments,
  type PublicFlight,
  type Viewport,
} from '@pidge/flight-sim';

import { APP_NAME } from '../../config/app-name';
import { COLORS, SPACING } from '../theme/tokens';
import { FONT_FAMILIES, FONT_SIZES } from '../theme/typography';
import { FlightCard } from './FlightCard';
import { FlightMap } from './FlightMap';

const TICK_MS = 1000;
/** Matches the `flight-map` dev story's own margin (`M1-13`) — the same
 * visual padding regardless of route length, per `M1-12`'s guarantee.
 * Exported so tests assert against this screen's own value rather than a
 * second, independently hand-copied literal that could silently drift from
 * it. */
export const PADDING_RATIO = 0.1;

export interface FlightScreenProps {
  readonly flight: PublicFlight;
  readonly originName: string;
  readonly destinationName: string;
  readonly viewport: Viewport;
  readonly unit?: 'imperial' | 'metric';
  /** The current time, in epoch ms — the server-corrected clock, never
   * `Date.now()` read from inside this component. Same contract as
   * `FlightCard`'s own required `now` prop. */
  readonly now: () => number;
  /** The OS "reduce motion" accessibility setting. When true, the marker
   * throttles to `FlightCard`'s own 1 Hz tick instead of a per-frame loop —
   * it never hides the marker, only slows how often it refreshes. */
  readonly reducedMotion?: boolean;
}

/**
 * `[M1-16]` Assembles the flight-in-progress screen: full-bleed `FlightMap`,
 * a title, `FlightCard`, and a live bird marker positioned by `M1-15`'s
 * `projectPoint`. This component computes nothing about the flight itself —
 * `flightStateAt`, `arcSegments`, `projectSegments` and `projectPoint` (all
 * pure `@pidge/flight-sim` functions) own every number; it only decides how
 * often to re-sample `now()` and hands the result to `FlightMap`/`FlightCard`
 * to draw, per `CLAUDE.md`'s layering rule.
 *
 * The initial marker position comes from a lazily-initialized `nowMs`
 * (`useState(() => now())`), so a flight mounted after `arrivesAtMs` renders
 * at rest at the destination on its very first frame — there is no separate
 * "arrived" branch and no entry animation to suppress, because every render
 * (including the first) recomputes `flightStateAt` fresh from `now()` rather
 * than animating from a stored or default position.
 */
export function FlightScreen({
  flight,
  originName,
  destinationName,
  viewport,
  unit = 'imperial',
  now,
  reducedMotion = false,
}: FlightScreenProps) {
  const [nowMs, setNowMs] = useState(() => now());

  // Read through refs, not effect deps, so a caller passing a fresh `now`
  // closure every render (unavoidable with an inline arrow function) never
  // tears down and restarts the loop before it has produced a tick — the
  // same care `FlightCard`'s own interval takes, which this item's own "Read
  // first" note calls out as required here too.
  const nowRef = useRef(now);
  nowRef.current = now;

  useEffect(() => {
    // Ticks once more and reports whether the flight has now arrived — once
    // it has, `flightStateAt` pins the bird at the destination forever, so
    // continuing to reschedule a frame (or a 1 Hz interval) after that point
    // would only burn CPU/battery for a value that can never change again.
    function tick(): boolean {
      const nextNowMs = nowRef.current();
      setNowMs(nextNowMs);
      return nextNowMs >= flight.arrivesAtMs;
    }

    if (reducedMotion) {
      const id = setInterval(() => {
        if (tick()) clearInterval(id);
      }, TICK_MS);
      return () => clearInterval(id);
    }

    let frameId = requestAnimationFrame(function frameLoop() {
      if (!tick()) {
        frameId = requestAnimationFrame(frameLoop);
      }
    });
    return () => cancelAnimationFrame(frameId);
  }, [reducedMotion, flight.arrivesAtMs]);

  const state = flightStateAt(flight, nowMs);
  // Memoized: the route's geometry never changes for the life of a mounted
  // flight, only the marker's own position does (every tick, below) — without
  // this, `arcSegments`' great-circle interpolation and `projectSegments`'
  // fit derivation would both re-run on every single frame for identical
  // input.
  const rawSegments = useMemo(
    () => arcSegments(flight.origin, flight.destination),
    [flight.origin.lat, flight.origin.lon, flight.destination.lat, flight.destination.lon],
  );
  const projectedSegments = useMemo(
    () => projectSegments(rawSegments, viewport, PADDING_RATIO),
    [rawSegments, viewport.width, viewport.height],
  );
  const markerPoint = projectPoint(state.position, rawSegments, viewport, PADDING_RATIO);

  return (
    <View style={styles.screen} testID="flight-screen">
      <FlightMap
        segments={projectedSegments}
        viewport={viewport}
        progress={state.progress}
        markerPoint={markerPoint}
      />
      <Text style={styles.title}>{APP_NAME}</Text>
      <FlightCard
        flight={flight}
        originName={originName}
        destinationName={destinationName}
        unit={unit}
        now={now}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.paper,
  },
  title: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILIES.dispatch,
    fontSize: FONT_SIZES.footnote,
    padding: SPACING.md,
  },
});
