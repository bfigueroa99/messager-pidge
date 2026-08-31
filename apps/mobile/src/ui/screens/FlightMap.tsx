import { StyleSheet, View } from 'react-native';
import Svg, { Polyline, Rect } from 'react-native-svg';
import { splitAtProgress, type ProjectedPoint, type Viewport } from '@pidge/flight-sim';

import { COLORS } from '../theme/tokens';

const REMAINING_DASH_PATTERN = '6,6';

export interface FlightMapProps {
  /** `projectSegments()`'s own output — never merged, so an antimeridian
   * split never draws a line across the seam (M1-12's guarantee about the
   * shape of this data holds all the way through to the pixels on screen). */
  readonly segments: readonly (readonly ProjectedPoint[])[];
  /** Must match the `Viewport` `projectSegments()` fit `segments` to, or the
   * drawn points land outside this canvas. */
  readonly viewport: Viewport;
  /** `flightStateAt(plan, serverNow()).progress` — a 0..1 fraction of the
   * route already flown. A prop, never read from the ambient clock inside
   * this component, matching `M1-04`'s `FlightCard` pattern. */
  readonly progress: number;
}

function toPointsAttr(points: readonly ProjectedPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

/**
 * `[M1-13]`/`[M1-14]` The chart. Pure presentation over already-projected
 * screen coordinates and a progress fraction — it takes points and a number
 * and draws them, it never computes a projection or a flight's progress
 * itself (that is `packages/flight-sim`'s `projectSegments`/`splitAtProgress`
 * and `flightStateAt`, per `CLAUDE.md`'s layering rule). One solid polyline
 * per flown segment and one dashed polyline per remaining segment; no city
 * labels, roads or traffic — this is a chart, not a real map.
 *
 * Renderer decision: ADR-011 (superseding ADR-007) chose `react-native-svg`
 * over `expo-maps` specifically because `expo-maps` has no web target, and
 * web is the only render path this container can screenshot or test
 * (`M0-08`/ADR-008).
 */
export function FlightMap({ segments, viewport, progress }: FlightMapProps) {
  const { flown, remaining } = splitAtProgress(segments, progress);

  return (
    <View style={styles.container} testID="flight-map">
      <Svg width={viewport.width} height={viewport.height}>
        <Rect x={0} y={0} width={viewport.width} height={viewport.height} fill={COLORS.chartWater} />
        {flown.map(
          (points, index) =>
            points.length >= 2 && (
              <Polyline key={`flown-${index}`} points={toPointsAttr(points)} fill="none" stroke={COLORS.bird} strokeWidth={2} />
            ),
        )}
        {remaining.map(
          (points, index) =>
            points.length >= 2 && (
              <Polyline
                key={`remaining-${index}`}
                points={toPointsAttr(points)}
                fill="none"
                stroke={COLORS.bird}
                strokeWidth={2}
                strokeDasharray={REMAINING_DASH_PATTERN}
              />
            ),
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
