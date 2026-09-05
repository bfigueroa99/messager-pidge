import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, G, Polyline, Rect } from 'react-native-svg';
import {
  clamp,
  REST_ZOOM,
  screenDistance,
  screenMidpoint,
  splitAtProgress,
  type ProjectedPoint,
  type Viewport,
} from '@pidge/flight-sim';

import { COLORS } from '../theme/tokens';

const REMAINING_DASH_PATTERN = '6,6';
const MARKER_RADIUS = 5;
/** The resting, fit-to-bounds view `M1-12` already produces. Pinching in can
 * only zoom past this, never below it (`M1-17`'s own "Do NOT" line) — the
 * same fact `maxZoomForMinVisibleKm`'s own floor is built from, so both
 * sides read it off `@pidge/flight-sim`'s one `REST_ZOOM` rather than each
 * declaring their own `1` literal. */
const MIN_ZOOM = REST_ZOOM;

/** Below this, two touches are close enough together that dividing by their
 * distance would blow up to `Infinity`/`NaN` — not a real pinch to measure a
 * ratio from yet. */
const MIN_PINCH_DISTANCE = 1;

/** Euclidean distance between the first two active touches — undefined for
 * anything other than a two-finger gesture, which is the only case a caller
 * of this reads it for. The actual distance math is `@pidge/flight-sim`'s
 * `screenDistance`, shared with the chart's own polyline-length math — this
 * only extracts the two touches' `{x, y}` from the RN event shape. */
function pinchDistance(touches: GestureResponderEvent['nativeEvent']['touches']): number {
  const [a, b] = touches;
  return screenDistance({ x: a!.pageX, y: a!.pageY }, { x: b!.pageX, y: b!.pageY });
}

/** The point a pan delta is measured from: a single touch's own position, or
 * the midpoint of the first two touches once a second finger joins. Using
 * the same notion of "the point" for one and two fingers means panning
 * never jumps when a pinch gesture picks up or drops a finger mid-gesture —
 * only the touch count driving `gestureStartRef`'s reset does that work. */
function gesturePoint(touches: GestureResponderEvent['nativeEvent']['touches']): ProjectedPoint {
  if (touches.length >= 2) {
    const [a, b] = touches;
    return screenMidpoint({ x: a!.pageX, y: a!.pageY }, { x: b!.pageX, y: b!.pageY });
  }
  const [a] = touches;
  return { x: a!.pageX, y: a!.pageY };
}

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
  /** `M1-17`'s `maxZoomForMinVisibleKm(rawSegments, viewport, paddingRatio,
   * 25)` — the ceiling a pinch gesture's zoom is clamped to, so the chart can
   * never be pinched down to a visible span under 25 km (`PRODUCT.md` §9:
   * this app never holds a precise location, and street-level zoom would
   * make that promise feel broken even though the stored coordinate itself
   * stays coarse). Pure geography, computed by the caller from the route and
   * viewport — this component only clamps a live gesture value against the
   * number it is handed, it never derives the number itself. */
  readonly maxZoom: number;
}

function toPointsAttr(points: readonly ProjectedPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

/** One `<Polyline>` per segment with at least 2 points; degenerate segments render nothing.
 * `vectorEffect="non-scaling-stroke"` (`[M1-18]`) keeps `strokeWidth` a constant on-screen
 * size regardless of the enclosing `<G>`'s pinch-to-zoom `scale(...)` — without it, the
 * line's visual width is multiplied by `displayZoom` along with the geometry it draws. */
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
          vectorEffect="non-scaling-stroke"
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
 *
 * `[M1-17]` Pinch (two-finger) and pan (one-finger) both go through one
 * `PanResponder` — React Native's own built-in touch-responder system, not a
 * third-party gesture-handling dependency. `zoom` and `pan` are UI gesture
 * state local to this component; the only piece of domain math involved is
 * `maxZoom` itself, computed upstream by `packages/flight-sim`'s
 * `maxZoomForMinVisibleKm` and handed in as a prop. This component never
 * derives that number — it only clamps a live gesture value against it.
 */
export function FlightMap({ segments, viewport, progress, markerPoint, maxZoom }: FlightMapProps) {
  const { flown, remaining } = splitAtProgress(segments, progress);

  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // A snapshot of where the gesture currently in progress started, reset
  // whenever the number of active touches changes — so lifting or adding a
  // finger mid-gesture (pinch to pan, or back) never causes a jump. Declared
  // ahead of the `[M1-19]` reconciliation below so a route/viewport change
  // can also invalidate a gesture already in flight, not just the state it
  // would otherwise resume from.
  const gestureStartRef = useRef<{
    touchCount: number;
    distance: number;
    point: ProjectedPoint;
    zoom: number;
    pan: { x: number; y: number };
  } | null>(null);

  // `[M1-19]` Reconcile pan/zoom back to the resting fit-to-bounds view
  // whenever `segments` or `viewport` become a genuinely different route or
  // view — a device rotation, or a new flight — rather than keep applying a
  // gesture's stale offset on top of newly-fit coordinates. Compared by
  // value, not reference: `FlightScreen` memoizes `segments` on the route and
  // viewport dimensions (so its reference is stable across this component's
  // own per-frame re-renders), but callers like `flight-demo.tsx` construct a
  // fresh `viewport` object literal on every one of *their* re-renders even
  // when `width`/`height` have not changed, which is exactly `FlightScreen`'s
  // own established pattern (`useMemo(..., [viewport.width, viewport.height])`)
  // for the same reason. On mount this compares against `null` and always
  // "changes" the ref, but `pan`/`zoom` already start at their resting values,
  // so the `setPan`/`setZoom` calls below are skipped rather than firing a
  // wasted extra render.
  //
  // Also invalidates `gestureStartRef`: a gesture can still be in progress
  // (finger down, no `onPanResponderRelease`/`onPanResponderTerminate`) at
  // the moment `segments`/`viewport` change — without this, the next move of
  // that same, still-active gesture would keep computing its delta from the
  // pre-change `start.pan` snapshot and immediately re-apply the very offset
  // this reset just cleared. Nulling it forces `onPanResponderMove`'s own
  // touch-count-change branch to re-`startGesture` from the just-reset `pan`,
  // the same rebase it already performs whenever a finger is added or lifted.
  const restingViewRef = useRef<{ segments: typeof segments; width: number; height: number } | null>(null);
  if (
    restingViewRef.current === null ||
    restingViewRef.current.segments !== segments ||
    restingViewRef.current.width !== viewport.width ||
    restingViewRef.current.height !== viewport.height
  ) {
    restingViewRef.current = { segments, width: viewport.width, height: viewport.height };
    if (pan.x !== 0 || pan.y !== 0) setPan({ x: 0, y: 0 });
    if (zoom !== MIN_ZOOM) setZoom(MIN_ZOOM);
    gestureStartRef.current = null;
  }

  // Re-clamped every render, not just inside the gesture handler below — if
  // `maxZoom` itself shrinks (a new, shorter flight; a rotated device) while
  // a larger zoom is already in effect, the displayed zoom must drop with
  // it immediately, not wait for the next pinch to happen to clamp it.
  const displayZoom = clamp(zoom, MIN_ZOOM, maxZoom);

  // Read through refs so `onPanResponderMove` (captured once, inside the
  // `PanResponder` created below) always sees the latest state rather than a
  // stale closure from whichever render happened to be current when the
  // gesture began — the same care `FlightScreen`'s own `now` ref takes.
  // `zoomRef` tracks `displayZoom`, not the raw `zoom` state, so a gesture
  // that starts right after `maxZoom` shrank re-bases from what is actually
  // on screen rather than from a stale, no-longer-valid value. `maxZoom`
  // itself needs no ref: nothing below reads it except `displayZoom`, which
  // already re-derives from the live prop every render.
  const zoomRef = useRef(displayZoom);
  zoomRef.current = displayZoom;
  const panRef = useRef(pan);
  panRef.current = pan;

  // Lazily initialized: `PanResponder.create` builds a full handler object
  // graph, and a plain `useRef(PanResponder.create(...))` would still
  // evaluate that argument expression — and throw its result away — on
  // every render, not just the first. `FlightScreen` re-renders this
  // component on every animation frame, so that would mean rebuilding it up
  // to 60 times a second for nothing. `startGesture` lives inside this same
  // guard for the same reason: nothing outside the handlers below ever
  // calls it, so building a fresh closure for it on every render would be
  // just as wasted.
  const panResponderRef = useRef<ReturnType<typeof PanResponder.create> | null>(null);
  if (panResponderRef.current === null) {
    function startGesture(evt: GestureResponderEvent) {
      const touches = evt.nativeEvent.touches;
      gestureStartRef.current = {
        touchCount: touches.length,
        distance: touches.length >= 2 ? pinchDistance(touches) : 0,
        point: gesturePoint(touches),
        zoom: zoomRef.current,
        pan: panRef.current,
      };
    }

    const endGesture = () => {
      gestureStartRef.current = null;
    };

    panResponderRef.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: startGesture,
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 0) return;
        if (gestureStartRef.current === null || touches.length !== gestureStartRef.current.touchCount) {
          startGesture(evt);
        }
        const start = gestureStartRef.current!;
        const point = gesturePoint(touches);

        if (touches.length >= 2) {
          const currentDistance = pinchDistance(touches);
          if (start.distance < MIN_PINCH_DISTANCE) {
            // The gesture started with both touches (near-)coincident — no
            // meaningful ratio to divide by yet. Re-base the distance from
            // here instead of dividing by (near-)zero, and pick this back up
            // once the fingers have actually spread apart.
            gestureStartRef.current = { ...start, distance: currentDistance };
          } else {
            // No clamp here: `displayZoom` (above) re-clamps this same
            // `zoom` state against the live `maxZoom` prop on every render
            // regardless, including the one this `setZoom` triggers — a
            // second clamp against a ref-mirrored `maxZoom` would only ever
            // agree with it, never override it.
            setZoom(start.zoom * (currentDistance / start.distance));
          }
        }
        setPan({ x: start.pan.x + (point.x - start.point.x), y: start.pan.y + (point.y - start.point.y) });
      },
      onPanResponderRelease: endGesture,
      onPanResponderTerminate: endGesture,
    });
  }
  const panResponder = panResponderRef.current;

  const cx = viewport.width / 2;
  const cy = viewport.height / 2;

  return (
    <View style={styles.container} testID="flight-map" {...panResponder.panHandlers}>
      <Svg width={viewport.width} height={viewport.height}>
        <Rect x={0} y={0} width={viewport.width} height={viewport.height} fill={COLORS.chartWater} />
        <G
          testID="flight-map-zoom-group"
          transform={`translate(${pan.x}, ${pan.y}) translate(${cx}, ${cy}) scale(${displayZoom}) translate(${-cx}, ${-cy})`}
        >
          {renderPolylines(flown, 'flown')}
          {renderPolylines(remaining, 'remaining', REMAINING_DASH_PATTERN)}
          {markerPoint && (
            // Inverse-scaled (`[M1-18]`) so the marker's on-screen radius stays
            // MARKER_RADIUS regardless of the enclosing <G>'s scale(displayZoom) —
            // `vectorEffect` only compensates a shape's *stroke*, not a filled
            // circle's own geometry, so the radius itself must counter the zoom.
            <Circle
              testID="bird-marker"
              cx={markerPoint.x}
              cy={markerPoint.y}
              r={MARKER_RADIUS / displayZoom}
              fill={COLORS.bird}
            />
          )}
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
