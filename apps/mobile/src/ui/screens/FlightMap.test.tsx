import { fireEvent, render } from '@testing-library/react';
import { arcSegments, projectSegments, type ProjectedPoint, type Viewport } from '@pidge/flight-sim';

import { FlightMap } from './FlightMap';

// Same real-world coordinates as `packages/flight-sim/src/__fixtures__/cities.ts` —
// duplicated rather than imported, since that fixtures module is test-only
// and not part of `@pidge/flight-sim`'s public package surface.
const TOKYO = { lat: 35.6762, lon: 139.6503 };
const LAX = { lat: 34.0522, lon: -118.2437 };

const VIEWPORT: Viewport = { width: 300, height: 200 };
const PADDING_RATIO = 0.1;
// The M1-13/M1-14 tests below don't exercise zoom at all — 1 keeps the
// pinch-to-zoom transform an identity so it can never affect their
// unrelated assertions about the raw `points`/`stroke-dasharray` attributes.
const NO_ZOOM = 1;

function touch(x: number, y: number, identifier = 0) {
  return { pageX: x, pageY: y, clientX: x, clientY: y, identifier, force: 1 };
}

/** react-native-web's responder system reads both `touches` (all active
 * fingers) and `changedTouches` (the ones this particular event is about) —
 * for a synthetic two-finger move where both fingers moved at once, they're
 * the same set. */
function touchEvent(touches: ReturnType<typeof touch>[]) {
  return { touches, changedTouches: touches };
}

function pointsAttrToPoints(pointsAttr: string): ProjectedPoint[] {
  return pointsAttr
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(',');
      return { x: Number(x), y: Number(y) };
    });
}

function zoomOf(container: HTMLElement): number {
  const group = container.querySelector('[data-testid="flight-map-zoom-group"]');
  const transform = group?.getAttribute('transform') ?? '';
  const match = /scale\(([\d.]+)\)/.exec(transform);
  if (!match) throw new Error(`no scale(...) found in transform: "${transform}"`);
  return Number(match[1]);
}

/** The leading `translate(pan.x, pan.y)` in the zoom group's transform — the
 * raw pan offset, before the fixed centering/scale translates that follow it. */
function panOf(container: HTMLElement): { x: number; y: number } {
  const group = container.querySelector('[data-testid="flight-map-zoom-group"]');
  const transform = group?.getAttribute('transform') ?? '';
  const match = /^translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(transform);
  if (!match) throw new Error(`no leading translate(...) found in transform: "${transform}"`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

describe('FlightMap', () => {
  it('[M1-13] keeps a Tokyo to LA route\'s two segments visually separated, with no line connecting across the seam', () => {
    const segments = arcSegments(TOKYO, LAX);
    // M0-12/M0-02 guarantee this route splits at the antimeridian.
    expect(segments.length).toBe(2);

    const projected = projectSegments(segments, VIEWPORT, PADDING_RATIO);
    // progress=1: the whole route is flown, matching M1-13's original "one
    // solid polyline per segment, drawing the full route" behaviour exactly.
    const { container } = render(<FlightMap segments={projected} viewport={VIEWPORT} progress={1} maxZoom={NO_ZOOM} />);

    const polylines = container.querySelectorAll('polyline');
    // One polyline per input segment — a single merged polyline would draw a
    // line connecting the seam, which arcSegments()'s split exists to prevent.
    expect(polylines.length).toBe(projected.length);

    polylines.forEach((polyline, index) => {
      const pointsAttr = polyline.getAttribute('points');
      expect(pointsAttr).toBeTruthy();
      expect(pointsAttrToPoints(pointsAttr!)).toEqual(projected[index]);
    });
  });

  it('[M1-13] draws exactly one polyline for a route with a single segment', () => {
    const NYC = { lat: 40.7128, lon: -74.006 };
    const segments = arcSegments(LAX, NYC);
    expect(segments.length).toBe(1);

    const projected = projectSegments(segments, VIEWPORT, PADDING_RATIO);
    const { container } = render(<FlightMap segments={projected} viewport={VIEWPORT} progress={1} maxZoom={NO_ZOOM} />);

    expect(container.querySelectorAll('polyline').length).toBe(1);
  });

  it('[M1-13] sizes the drawing surface to the given viewport', () => {
    const segments = projectSegments(arcSegments(LAX, TOKYO), VIEWPORT, PADDING_RATIO);
    const { container } = render(<FlightMap segments={segments} viewport={VIEWPORT} progress={1} maxZoom={NO_ZOOM} />);

    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe(String(VIEWPORT.width));
    expect(svg?.getAttribute('height')).toBe(String(VIEWPORT.height));
  });

  it('[M1-14] a flight that has not yet departed renders entirely dashed', () => {
    const NYC = { lat: 40.7128, lon: -74.006 };
    const projected = projectSegments(arcSegments(LAX, NYC), VIEWPORT, PADDING_RATIO);
    const { container } = render(<FlightMap segments={projected} viewport={VIEWPORT} progress={0} maxZoom={NO_ZOOM} />);

    const polylines = container.querySelectorAll('polyline');
    expect(polylines.length).toBeGreaterThan(0);
    polylines.forEach((polyline) => expect(polyline.getAttribute('stroke-dasharray')).toBeTruthy());
  });

  it('[M1-14] a flight whose arrival has passed renders entirely solid', () => {
    const NYC = { lat: 40.7128, lon: -74.006 };
    const projected = projectSegments(arcSegments(LAX, NYC), VIEWPORT, PADDING_RATIO);
    const { container } = render(<FlightMap segments={projected} viewport={VIEWPORT} progress={1} maxZoom={NO_ZOOM} />);

    const polylines = container.querySelectorAll('polyline');
    expect(polylines.length).toBeGreaterThan(0);
    polylines.forEach((polyline) => expect(polyline.getAttribute('stroke-dasharray')).toBeFalsy());
  });

  it('[M1-14] at 40% elapsed, renders both a solid flown polyline and a dashed remaining polyline', () => {
    const NYC = { lat: 40.7128, lon: -74.006 };
    const projected = projectSegments(arcSegments(LAX, NYC), VIEWPORT, PADDING_RATIO);
    const { container } = render(<FlightMap segments={projected} viewport={VIEWPORT} progress={0.4} maxZoom={NO_ZOOM} />);

    const polylines = Array.from(container.querySelectorAll('polyline'));
    const solid = polylines.filter((p) => !p.getAttribute('stroke-dasharray'));
    const dashed = polylines.filter((p) => p.getAttribute('stroke-dasharray'));

    expect(solid.length).toBeGreaterThan(0);
    expect(dashed.length).toBeGreaterThan(0);
  });

  it('[M1-14] keeps the Tokyo to LA route\'s two segments visually separated when partway flown', () => {
    const segments = arcSegments(TOKYO, LAX);
    expect(segments.length).toBe(2);

    const projected = projectSegments(segments, VIEWPORT, PADDING_RATIO);
    const { container } = render(<FlightMap segments={projected} viewport={VIEWPORT} progress={0.5} maxZoom={NO_ZOOM} />);

    // Each of the two input segments contributes at most a flown half and a
    // remaining half — never a polyline spanning both segments, which would
    // draw a line connecting the antimeridian seam.
    expect(container.querySelectorAll('polyline').length).toBeLessThanOrEqual(4);
  });
});

describe('FlightMap pinch-to-zoom', () => {
  function renderMap(maxZoom: number) {
    const NYC = { lat: 40.7128, lon: -74.006 };
    const projected = projectSegments(arcSegments(LAX, NYC), VIEWPORT, PADDING_RATIO);
    return render(<FlightMap segments={projected} viewport={VIEWPORT} progress={0.4} maxZoom={maxZoom} />);
  }

  it('[M1-17] starts at zoom 1 (M1-12\'s own fit-to-bounds view) before any gesture', () => {
    const { container } = renderMap(10);
    expect(zoomOf(container)).toBe(1);
  });

  it('[M1-17] a two-finger pinch apart zooms in, up to but never past the given maxZoom', () => {
    const { container, getByTestId } = renderMap(3);
    const target = getByTestId('flight-map');

    fireEvent.touchStart(target, touchEvent([touch(140, 100), touch(160, 100)]));
    // Fingers move from 20px apart to 2000px apart — a pinch far larger than
    // any real gesture could produce — to prove the clamp holds even at the
    // extreme, not just near the boundary.
    fireEvent.touchMove(target, touchEvent([touch(-860, 100), touch(1160, 100)]));

    expect(zoomOf(container)).toBe(3);
  });

  it("[M1-17] a maxZoom of 1 (a route already at or under the minimum visible span at rest) allows no pinch-in at all", () => {
    const { container, getByTestId } = renderMap(1);
    const target = getByTestId('flight-map');

    fireEvent.touchStart(target, touchEvent([touch(140, 100), touch(160, 100)]));
    fireEvent.touchMove(target, touchEvent([touch(-860, 100), touch(1160, 100)]));

    expect(zoomOf(container)).toBe(1);
  });

  it('[M1-17] a small pinch apart within the maxZoom budget zooms in by roughly the requested factor', () => {
    const { container, getByTestId } = renderMap(10);
    const target = getByTestId('flight-map');

    fireEvent.touchStart(target, touchEvent([touch(140, 100), touch(160, 100)]));
    // Fingers move from 20px apart to 40px apart: a 2x pinch, well inside maxZoom.
    fireEvent.touchMove(target, touchEvent([touch(130, 100), touch(170, 100)]));

    expect(zoomOf(container)).toBeCloseTo(2, 5);
  });

  it('[M1-17] pinching back in reduces zoom, never going below 1', () => {
    const { container, getByTestId } = renderMap(10);
    const target = getByTestId('flight-map');

    fireEvent.touchStart(target, touchEvent([touch(140, 100), touch(160, 100)]));
    fireEvent.touchMove(target, touchEvent([touch(100, 100), touch(200, 100)])); // 5x
    expect(zoomOf(container)).toBeCloseTo(5, 5);

    // A fresh gesture, pinching from wide back to narrow.
    fireEvent.touchStart(target, touchEvent([touch(100, 100), touch(200, 100)]));
    fireEvent.touchMove(target, touchEvent([touch(145, 100), touch(155, 100)])); // back toward together
    expect(zoomOf(container)).toBeGreaterThanOrEqual(1);
    expect(zoomOf(container)).toBeLessThan(5);
  });

  it('[M1-17] re-clamps an already-pinched-in zoom the moment maxZoom shrinks, with no further gesture', () => {
    const NYC = { lat: 40.7128, lon: -74.006 };
    const projected = projectSegments(arcSegments(LAX, NYC), VIEWPORT, PADDING_RATIO);
    const { container, getByTestId, rerender } = render(
      <FlightMap segments={projected} viewport={VIEWPORT} progress={0.4} maxZoom={10} />,
    );
    const target = getByTestId('flight-map');

    fireEvent.touchStart(target, touchEvent([touch(140, 100), touch(160, 100)]));
    fireEvent.touchMove(target, touchEvent([touch(100, 100), touch(200, 100)])); // 5x
    expect(zoomOf(container)).toBeCloseTo(5, 5);

    // No new gesture — only the ceiling itself drops below the zoom already
    // in effect (e.g. `FlightScreen` recomputed `maxZoom` for a new, shorter
    // flight, or a device rotation changed the viewport).
    rerender(<FlightMap segments={projected} viewport={VIEWPORT} progress={0.4} maxZoom={2} />);

    expect(zoomOf(container)).toBe(2);
  });

  it('[M1-17] a pinch that starts with both fingers at the same point never produces a NaN zoom', () => {
    const { container, getByTestId } = renderMap(10);
    const target = getByTestId('flight-map');

    // Both touches begin at the exact same point — a zero-length pinch
    // baseline that a naive `currentDistance / start.distance` would turn
    // into `Infinity` or `NaN`.
    fireEvent.touchStart(target, touchEvent([touch(150, 100), touch(150, 100)]));
    fireEvent.touchMove(target, touchEvent([touch(100, 100), touch(200, 100)]));

    expect(Number.isFinite(zoomOf(container))).toBe(true);
    expect(zoomOf(container)).toBeGreaterThanOrEqual(1);
    expect(zoomOf(container)).toBeLessThanOrEqual(10);
  });
});

describe('FlightMap marker and route line at high zoom', () => {
  function pinchToMaxZoom(getByTestId: (id: string) => HTMLElement) {
    const target = getByTestId('flight-map');
    fireEvent.touchStart(target, touchEvent([touch(140, 100), touch(160, 100)]));
    // Fingers move far enough apart to guarantee the clamp against maxZoom
    // (not the raw pinch ratio) is what ends up on screen.
    fireEvent.touchMove(target, touchEvent([touch(-8600, 100), touch(8800, 100)]));
  }

  it("[M1-18] at the route's own maxZoom, the marker's on-screen radius stays within a small, fixed factor of its unzoomed radius", () => {
    const HIGH_MAX_ZOOM = 190; // representative of a real long-route/small-viewport maxZoom (see the item's own "Why")
    const NYC = { lat: 40.7128, lon: -74.006 };
    const projected = projectSegments(arcSegments(LAX, NYC), VIEWPORT, PADDING_RATIO);
    const { container, getByTestId } = render(
      <FlightMap
        segments={projected}
        viewport={VIEWPORT}
        progress={0.4}
        maxZoom={HIGH_MAX_ZOOM}
        markerPoint={{ x: 150, y: 100 }}
      />,
    );

    const unzoomedRadius = Number(container.querySelector('circle')!.getAttribute('r'));

    pinchToMaxZoom(getByTestId);
    expect(zoomOf(container)).toBe(HIGH_MAX_ZOOM);

    const zoomedRadius = Number(container.querySelector('circle')!.getAttribute('r'));
    const onScreenRadius = zoomedRadius * zoomOf(container);

    // Within 1% of the resting, unzoomed on-screen radius — not "hundreds of
    // pixels" the way an uncompensated `r` multiplied by a 190x scale would be.
    expect(onScreenRadius).toBeCloseTo(unzoomedRadius, 1);
  });

  it("[M1-18] at the route's own maxZoom, the route line's on-screen width stays within a small, fixed factor of its unzoomed width", () => {
    const HIGH_MAX_ZOOM = 190;
    const NYC = { lat: 40.7128, lon: -74.006 };
    const projected = projectSegments(arcSegments(LAX, NYC), VIEWPORT, PADDING_RATIO);
    const { container, getByTestId } = render(
      <FlightMap segments={projected} viewport={VIEWPORT} progress={1} maxZoom={HIGH_MAX_ZOOM} />,
    );

    // `vector-effect="non-scaling-stroke"` is what actually keeps the line's
    // *rendered* width constant regardless of the enclosing `<G>`'s scale —
    // an SVG-spec guarantee, not something jsdom itself computes pixels for.
    container.querySelectorAll('polyline').forEach((polyline) => {
      expect(polyline.getAttribute('vector-effect')).toBe('non-scaling-stroke');
      expect(polyline.getAttribute('stroke-width')).toBe('2');
    });

    pinchToMaxZoom(getByTestId);
    expect(zoomOf(container)).toBe(HIGH_MAX_ZOOM);

    // The raw stroke-width attribute itself never changes with zoom — the
    // non-scaling-stroke effect is what stops the enclosing scale() from
    // blowing the visible width up along with it.
    container.querySelectorAll('polyline').forEach((polyline) => {
      expect(polyline.getAttribute('vector-effect')).toBe('non-scaling-stroke');
      expect(polyline.getAttribute('stroke-width')).toBe('2');
    });
  });

  it('[M1-18] the non-scaling-stroke/inverse-scaled-radius fix leaves M1-13/M1-14/M1-16/M1-17 behavior unchanged', () => {
    const NYC = { lat: 40.7128, lon: -74.006 };
    const projected = projectSegments(arcSegments(LAX, NYC), VIEWPORT, PADDING_RATIO);

    // M1-14: still exactly one solid and one dashed polyline at 40% elapsed.
    const { container, getByTestId } = render(
      <FlightMap
        segments={projected}
        viewport={VIEWPORT}
        progress={0.4}
        maxZoom={10}
        markerPoint={{ x: 150, y: 100 }}
      />,
    );
    const polylines = Array.from(container.querySelectorAll('polyline'));
    expect(polylines.filter((p) => !p.getAttribute('stroke-dasharray')).length).toBeGreaterThan(0);
    expect(polylines.filter((p) => p.getAttribute('stroke-dasharray')).length).toBeGreaterThan(0);

    // M1-13: the raw `points` attribute still carries real, well-formed
    // coordinates — the new `vectorEffect` prop changes how a browser
    // renders the stroke, not the polyline's own geometry.
    polylines.forEach((polyline) => {
      const points = pointsAttrToPoints(polyline.getAttribute('points')!);
      expect(points.length).toBeGreaterThanOrEqual(2);
      points.forEach((point) => {
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
      });
    });

    // M1-16/M1-17: at rest (no gesture) the marker sits exactly at its given
    // point and the chart starts at zoom 1, both unaffected by this item.
    expect(zoomOf(container)).toBe(1);
    expect(container.querySelector('circle')!.getAttribute('cx')).toBe('150');
    expect(container.querySelector('circle')!.getAttribute('cy')).toBe('100');

    // M1-17: pinch-to-zoom itself — clamped to maxZoom — still works exactly
    // as it did before this item.
    const target = getByTestId('flight-map');
    fireEvent.touchStart(target, touchEvent([touch(140, 100), touch(160, 100)]));
    fireEvent.touchMove(target, touchEvent([touch(-860, 100), touch(1160, 100)]));
    expect(zoomOf(container)).toBe(10);
  });
});

describe('FlightMap pan/zoom reconciliation on route or viewport change', () => {
  it("[M1-19] a viewport change (simulating a device rotation) after a pan gesture leaves the route framed within the new viewport's bounds, not shifted off it", () => {
    const NYC = { lat: 40.7128, lon: -74.006 };
    const projected = projectSegments(arcSegments(LAX, NYC), VIEWPORT, PADDING_RATIO);
    const { container, getByTestId, rerender } = render(
      <FlightMap segments={projected} viewport={VIEWPORT} progress={0.4} maxZoom={10} />,
    );
    const target = getByTestId('flight-map');

    // A one-finger pan (no pinch) — moves 50px right and 30px down.
    fireEvent.touchStart(target, touchEvent([touch(150, 100)]));
    fireEvent.touchMove(target, touchEvent([touch(200, 130)]));
    expect(panOf(container)).toEqual({ x: 50, y: 30 });

    // Simulate a device rotation: the viewport's dimensions swap, with no
    // new gesture in progress and the same route (segments unchanged in
    // this isolated FlightMap-level test, since projecting a rotated
    // viewport is FlightScreen's own concern, not this component's).
    const rotatedViewport: Viewport = { width: VIEWPORT.height, height: VIEWPORT.width };
    rerender(<FlightMap segments={projected} viewport={rotatedViewport} progress={0.4} maxZoom={10} />);

    // The stale pan from the old viewport must not persist on top of the
    // newly-fit coordinates — the resting view is the fit-to-bounds framing,
    // pan back at (0, 0).
    expect(panOf(container)).toEqual({ x: 0, y: 0 });
  });

  it('[M1-19] a route change (a new segments reference) after a pinch and pan resets both zoom and pan to the resting view', () => {
    const NYC = { lat: 40.7128, lon: -74.006 };
    const projected = projectSegments(arcSegments(LAX, NYC), VIEWPORT, PADDING_RATIO);
    const { container, getByTestId, rerender } = render(
      <FlightMap segments={projected} viewport={VIEWPORT} progress={0.4} maxZoom={10} />,
    );
    const target = getByTestId('flight-map');

    fireEvent.touchStart(target, touchEvent([touch(140, 100), touch(160, 100)]));
    fireEvent.touchMove(target, touchEvent([touch(100, 100), touch(200, 100)])); // 5x pinch
    expect(zoomOf(container)).toBeCloseTo(5, 5);
    // Drop to one finger without an intervening release — the touch count
    // changing mid-gesture is itself what `onPanResponderMove` rebases from
    // (matching the real multi-touch case: lifting a finger is a move event,
    // not a fresh responder grant), so this first one-finger move only
    // re-bases and contributes no delta of its own.
    fireEvent.touchMove(target, touchEvent([touch(150, 100)]));
    expect(panOf(container)).toEqual({ x: 0, y: 0 });
    fireEvent.touchMove(target, touchEvent([touch(180, 120)])); // now pan by (30, 20)
    expect(panOf(container)).toEqual({ x: 30, y: 20 });

    // A genuinely new route: a fresh (but distinct) projected-segments array,
    // as FlightScreen would hand this component after its own `useMemo`
    // recomputes for a new flight.
    const newRouteSegments = projectSegments(arcSegments(LAX, NYC), VIEWPORT, PADDING_RATIO);
    rerender(<FlightMap segments={newRouteSegments} viewport={VIEWPORT} progress={0} maxZoom={10} />);

    expect(zoomOf(container)).toBe(1);
    expect(panOf(container)).toEqual({ x: 0, y: 0 });
  });

  it('[M1-19] a maxZoom-only re-render (identical segments/viewport) does not reset an in-progress zoom — the M1-17 re-clamp scenario is unaffected', () => {
    const NYC = { lat: 40.7128, lon: -74.006 };
    const projected = projectSegments(arcSegments(LAX, NYC), VIEWPORT, PADDING_RATIO);
    const { container, getByTestId, rerender } = render(
      <FlightMap segments={projected} viewport={VIEWPORT} progress={0.4} maxZoom={10} />,
    );
    const target = getByTestId('flight-map');

    fireEvent.touchStart(target, touchEvent([touch(140, 100), touch(160, 100)]));
    fireEvent.touchMove(target, touchEvent([touch(100, 100), touch(200, 100)])); // 5x
    expect(zoomOf(container)).toBeCloseTo(5, 5);

    // Same segments/viewport reference and values — only maxZoom shrinks.
    // M1-19's reconciliation must not mistake this for a genuinely different
    // route/view and reset the zoom to 1 instead of re-clamping it to 2.
    rerender(<FlightMap segments={projected} viewport={VIEWPORT} progress={0.4} maxZoom={2} />);
    expect(zoomOf(container)).toBe(2);
  });

  it('[M1-19] a route/viewport change mid-gesture does not let the still-active gesture re-apply its stale pre-change offset on its next move', () => {
    const NYC = { lat: 40.7128, lon: -74.006 };
    const projected = projectSegments(arcSegments(LAX, NYC), VIEWPORT, PADDING_RATIO);
    const { container, getByTestId, rerender } = render(
      <FlightMap segments={projected} viewport={VIEWPORT} progress={0.4} maxZoom={10} />,
    );
    const target = getByTestId('flight-map');

    // A one-finger pan gesture, still in progress — no touchEnd/terminate,
    // matching a real finger still down on the glass.
    fireEvent.touchStart(target, touchEvent([touch(150, 100)]));
    fireEvent.touchMove(target, touchEvent([touch(200, 130)]));
    expect(panOf(container)).toEqual({ x: 50, y: 30 });

    // The route/viewport changes mid-gesture (e.g. a device rotation while
    // the user's finger is still on the glass). The reconciliation snaps the
    // displayed pan back to the resting view immediately.
    const rotatedViewport: Viewport = { width: VIEWPORT.height, height: VIEWPORT.width };
    rerender(<FlightMap segments={projected} viewport={rotatedViewport} progress={0.4} maxZoom={10} />);
    expect(panOf(container)).toEqual({ x: 0, y: 0 });

    // The same gesture continues (same touch count, no new touchStart). Its
    // very first move after the reconciliation is itself the rebase (mirrors
    // the touch-count-change case elsewhere in this file): the finger has not
    // left (210, 140... well, still at its pre-change position of (200, 130)
    // at this instant), so this move contributes no delta of its own — it
    // only re-anchors `gestureStartRef` to the just-reset pan of (0, 0)
    // instead of the stale pre-change start.pan of (50, 30).
    fireEvent.touchMove(target, touchEvent([touch(200, 130)]));
    expect(panOf(container)).toEqual({ x: 0, y: 0 });

    // The finger then actually moves by (10, 10) from that rebased anchor —
    // proving the delta is measured from the just-reset pan, never re-adding
    // the gesture's pre-change (50, 30) offset on top of it.
    fireEvent.touchMove(target, touchEvent([touch(210, 140)]));
    expect(panOf(container)).toEqual({ x: 10, y: 10 });
  });
});
