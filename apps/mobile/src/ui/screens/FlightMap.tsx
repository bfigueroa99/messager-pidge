import { StyleSheet, View } from 'react-native';
import Svg, { Polyline, Rect } from 'react-native-svg';
import type { ProjectedPoint, Viewport } from '@pidge/flight-sim';

import { COLORS } from '../theme/tokens';

export interface FlightMapProps {
  /** `projectSegments()`'s own output — never merged, so an antimeridian
   * split never draws a line across the seam (M1-12's guarantee about the
   * shape of this data holds all the way through to the pixels on screen). */
  readonly segments: readonly (readonly ProjectedPoint[])[];
  /** Must match the `Viewport` `projectSegments()` fit `segments` to, or the
   * drawn points land outside this canvas. */
  readonly viewport: Viewport;
}

/**
 * `[M1-13]` The chart. Pure presentation over already-projected screen
 * coordinates — it takes points and draws them, it never computes a
 * projection itself (that is `packages/flight-sim`'s `projectSegments`, per
 * `CLAUDE.md`'s layering rule). One solid polyline per input segment; no
 * flown/remaining split yet (`M1-14`), no city labels, roads or traffic —
 * this is a chart, not a real map.
 *
 * Renderer decision: ADR-011 (superseding ADR-007) chose `react-native-svg`
 * over `expo-maps` specifically because `expo-maps` has no web target, and
 * web is the only render path this container can screenshot or test
 * (`M0-08`/ADR-008).
 */
export function FlightMap({ segments, viewport }: FlightMapProps) {
  return (
    <View style={styles.container} testID="flight-map">
      <Svg width={viewport.width} height={viewport.height}>
        <Rect x={0} y={0} width={viewport.width} height={viewport.height} fill={COLORS.chartWater} />
        {segments.map((segment, index) => (
          <Polyline
            key={index}
            points={segment.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke={COLORS.bird}
            strokeWidth={2}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
