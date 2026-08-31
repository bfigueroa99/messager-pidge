import { render } from '@testing-library/react';
import { arcSegments, projectSegments, type ProjectedPoint, type Viewport } from '@pidge/flight-sim';

import { FlightMap } from './FlightMap';

// Same real-world coordinates as `packages/flight-sim/src/__fixtures__/cities.ts` —
// duplicated rather than imported, since that fixtures module is test-only
// and not part of `@pidge/flight-sim`'s public package surface.
const TOKYO = { lat: 35.6762, lon: 139.6503 };
const LAX = { lat: 34.0522, lon: -118.2437 };

const VIEWPORT: Viewport = { width: 300, height: 200 };
const PADDING_RATIO = 0.1;

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
    const { container } = render(<FlightMap segments={projected} viewport={VIEWPORT} progress={1} />);

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
    const { container } = render(<FlightMap segments={projected} viewport={VIEWPORT} progress={1} />);

    expect(container.querySelectorAll('polyline').length).toBe(1);
  });

  it('[M1-13] sizes the drawing surface to the given viewport', () => {
    const segments = projectSegments(arcSegments(LAX, TOKYO), VIEWPORT, PADDING_RATIO);
    const { container } = render(<FlightMap segments={segments} viewport={VIEWPORT} progress={1} />);

    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe(String(VIEWPORT.width));
    expect(svg?.getAttribute('height')).toBe(String(VIEWPORT.height));
  });

  it('[M1-14] a flight that has not yet departed renders entirely dashed', () => {
    const NYC = { lat: 40.7128, lon: -74.006 };
    const projected = projectSegments(arcSegments(LAX, NYC), VIEWPORT, PADDING_RATIO);
    const { container } = render(<FlightMap segments={projected} viewport={VIEWPORT} progress={0} />);

    const polylines = container.querySelectorAll('polyline');
    expect(polylines.length).toBeGreaterThan(0);
    polylines.forEach((polyline) => expect(polyline.getAttribute('stroke-dasharray')).toBeTruthy());
  });

  it('[M1-14] a flight whose arrival has passed renders entirely solid', () => {
    const NYC = { lat: 40.7128, lon: -74.006 };
    const projected = projectSegments(arcSegments(LAX, NYC), VIEWPORT, PADDING_RATIO);
    const { container } = render(<FlightMap segments={projected} viewport={VIEWPORT} progress={1} />);

    const polylines = container.querySelectorAll('polyline');
    expect(polylines.length).toBeGreaterThan(0);
    polylines.forEach((polyline) => expect(polyline.getAttribute('stroke-dasharray')).toBeFalsy());
  });

  it('[M1-14] at 40% elapsed, renders both a solid flown polyline and a dashed remaining polyline', () => {
    const NYC = { lat: 40.7128, lon: -74.006 };
    const projected = projectSegments(arcSegments(LAX, NYC), VIEWPORT, PADDING_RATIO);
    const { container } = render(<FlightMap segments={projected} viewport={VIEWPORT} progress={0.4} />);

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
    const { container } = render(<FlightMap segments={projected} viewport={VIEWPORT} progress={0.5} />);

    // Each of the two input segments contributes at most a flown half and a
    // remaining half — never a polyline spanning both segments, which would
    // draw a line connecting the antimeridian seam.
    expect(container.querySelectorAll('polyline').length).toBeLessThanOrEqual(4);
  });
});
