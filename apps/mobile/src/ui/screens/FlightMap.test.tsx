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
  function zoomOf(container: HTMLElement): number {
    const group = container.querySelector('[data-testid="flight-map-zoom-group"]');
    const transform = group?.getAttribute('transform') ?? '';
    const match = /scale\(([\d.]+)\)/.exec(transform);
    if (!match) throw new Error(`no scale(...) found in transform: "${transform}"`);
    return Number(match[1]);
  }

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
