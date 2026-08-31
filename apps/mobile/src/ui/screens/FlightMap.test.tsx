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
    const { container } = render(<FlightMap segments={projected} viewport={VIEWPORT} />);

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
    const { container } = render(<FlightMap segments={projected} viewport={VIEWPORT} />);

    expect(container.querySelectorAll('polyline').length).toBe(1);
  });

  it('[M1-13] sizes the drawing surface to the given viewport', () => {
    const segments = projectSegments(arcSegments(LAX, TOKYO), VIEWPORT, PADDING_RATIO);
    const { container } = render(<FlightMap segments={segments} viewport={VIEWPORT} />);

    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe(String(VIEWPORT.width));
    expect(svg?.getAttribute('height')).toBe(String(VIEWPORT.height));
  });
});
