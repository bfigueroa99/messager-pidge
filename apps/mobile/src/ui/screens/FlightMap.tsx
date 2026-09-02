import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Polyline, Rect } from 'react-native-svg';
import { splitAtProgress, type ProjectedPoint, type Viewport } from '@pidge/flight-sim';

import { COLORS } from '../theme/tokens';

const REMAINING_DASH_PATTERN = '6,6';
const MARKER_RADIUS = 5;

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
  /** `M1-15`'s `projectPoint(flightStateAt(plan, serverNow()).position, ...)`
   * — the bird's real geo-space position, projected through the identical
   * fit `segments` was. Omitted renders no marker; this component does not
   * compute or default a position itself. */
  readonly markerPoint?: ProjectedPoint;
}

function toPointsAttr(points: readonly ProjectedPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

/** One `<Polyline>` per segment with at least 2 points; degenerate segments render nothing. */
function renderPolylines(
  segmentsList: readonly (readonly ProjectedPoint[])[],
  keyPrefix: string,
  strokeDasharray?: string,
) {
  return segmentsList.map(
    (points, index) =>
      points.length >= 2 && (
        <Polyline
          key={`${keyPrefix}-${index}`}
          points={toPointsAttr(points)}
          fill="none"
          stroke={COLORS.bird}
          strokeWidth={2}
          strokeDasharray={strokeDasharray}
        />
      ),
  );
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
export function FlightMap({ segments, viewport, progress, markerPoint }: FlightMapProps) {
  const { flown, remaining } = splitAtProgress(segments, progress);

  return (
    <View style={styles.container} testID="flight-map">
      <Svg width={viewport.width} height={viewport.height}>
        <Rect x={0} y={0} width={viewport.width} height={viewport.height} fill={COLORS.chartWater} />
        {renderPolylines(flown, 'flown')}
        {renderPolylines(remaining, 'remaining', REMAINING_DASH_PATTERN)}
        {markerPoint && (
          <Circle
            testID="bird-marker"
            cx={markerPoint.x}
            cy={markerPoint.y}
            r={MARKER_RADIUS}
            fill={COLORS.bird}
          />
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
