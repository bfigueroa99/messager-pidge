import { arcSegments, interpolate } from './geo';
import { LAX, LONDON, NYC, SYDNEY, TOKYO } from './__fixtures__/cities';
import { projectSegments } from './project';

const VIEWPORT = { width: 400, height: 800 };
const PADDING_RATIO = 0.1;

function boundsOf(projected: readonly { readonly x: number; readonly y: number }[][]) {
  const xs = projected.flatMap((segment) => segment.map((p) => p.x));
  const ys = projected.flatMap((segment) => segment.map((p) => p.y));
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

describe('projectSegments', () => {
  it('[M1-12] a Tokyo to LA route projects to two separate point arrays with no point connecting across the antimeridian seam', () => {
    const segments = arcSegments(TOKYO, LAX);
    expect(segments.length).toBe(2);

    const projected = projectSegments(segments, VIEWPORT, PADDING_RATIO);

    expect(projected.length).toBe(2);
    projected.forEach((segment, i) => expect(segment.length).toBe(segments[i]!.length));

    // A naive min/max over the raw (wrapped) longitudes would blow the fitted
    // range out to nearly the full globe's width; every point must stay
    // finite and inside the actual viewport.
    for (const segment of projected) {
      for (const point of segment) {
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(VIEWPORT.width);
      }
    }
  });

  it("[M1-12] a LA to NYC route's projected midpoint sits above the projected chord midpoint", () => {
    const bowMidpoint = interpolate(LAX, NYC, 0.5);
    // Project the endpoints and the bow midpoint together so all three share
    // one scale and origin.
    const [start, mid, end] = projectSegments([[LAX, bowMidpoint, NYC]], VIEWPORT, PADDING_RATIO)[0]!;
    const chordMidpointY = (start!.y + end!.y) / 2;

    expect(mid!.y).toBeLessThan(chordMidpointY);
  });

  it('[M1-12] the route fits its bounds with the same padding ratio at 5 mi and 10,000 mi', () => {
    const fiveMiHop = arcSegments(LAX, { lat: 34.0603, lon: -118.1741 }); // ~5 mi
    const tenThousandMiCrossing = arcSegments(LONDON, SYDNEY); // ~10,562 mi

    const padX = VIEWPORT.width * PADDING_RATIO;
    const padY = VIEWPORT.height * PADDING_RATIO;

    for (const segments of [fiveMiHop, tenThousandMiCrossing]) {
      const { minX, maxX, minY, maxY } = boundsOf(projectSegments(segments, VIEWPORT, PADDING_RATIO));

      // Centered fit-to-bounds: the constraining axis touches the padding
      // line almost exactly; the other axis has at least that much margin.
      expect(minX).toBeGreaterThanOrEqual(padX - 1e-6);
      expect(maxX).toBeLessThanOrEqual(VIEWPORT.width - padX + 1e-6);
      expect(minY).toBeGreaterThanOrEqual(padY - 1e-6);
      expect(maxY).toBeLessThanOrEqual(VIEWPORT.height - padY + 1e-6);
      expect(Math.min(minX - padX, minY - padY)).toBeCloseTo(0, 1);
    }
  });

  it('[M1-12] returns nothing for an empty segment list', () => {
    expect(projectSegments([], VIEWPORT, PADDING_RATIO)).toEqual([]);
  });

  it('[M1-12] clamps an out-of-range padding ratio rather than inverting or collapsing the route', () => {
    const segments = arcSegments(LAX, NYC);

    for (const badRatio of [0.5, 1, -1]) {
      const { minX, maxX, minY, maxY } = boundsOf(projectSegments(segments, VIEWPORT, badRatio));
      expect(maxX).toBeGreaterThan(minX);
      expect(maxY).toBeGreaterThan(minY);
    }
  });
});
