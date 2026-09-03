import { arcSegments, haversineKm, interpolate } from './geo';
import { LAX, LONDON, NYC, SYDNEY, TOKYO } from './__fixtures__/cities';
import { planFlight } from './plan';
import { flightStateAt } from './state';
import { maxZoomForMinVisibleKm, projectPoint, projectSegments, splitAtProgress, type ProjectedPoint } from './project';
import type { LatLng } from './types';

const VIEWPORT = { width: 400, height: 800 };
const PADDING_RATIO = 0.1;
// A few km from LAX — short enough that it needs far less zoom to reach a
// 25 km visible span than the LA-to-NYC route does.
const LAX_NEARBY: LatLng = { lat: LAX.lat + 0.05, lon: LAX.lon + 0.05 };

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

function totalLength(segments: readonly (readonly { x: number; y: number }[])[]): number {
  return segments.reduce((sum, segment) => {
    let length = 0;
    for (let i = 1; i < segment.length; i++) {
      length += Math.hypot(segment[i]!.x - segment[i - 1]!.x, segment[i]!.y - segment[i - 1]!.y);
    }
    return sum + length;
  }, 0);
}

describe('splitAtProgress', () => {
  it('[M1-14] at 40% elapsed, the flown portion covers 40% of the total projected route length', () => {
    const projected = projectSegments(arcSegments(LAX, NYC), VIEWPORT, PADDING_RATIO);
    const total = totalLength(projected);

    const { flown } = splitAtProgress(projected, 0.4);

    expect(totalLength(flown) / total).toBeCloseTo(0.4, 2);
  });

  it('[M1-14] a flight whose arrival has passed renders entirely solid', () => {
    const projected = projectSegments(arcSegments(LAX, NYC), VIEWPORT, PADDING_RATIO);

    const { flown, remaining } = splitAtProgress(projected, 1);

    expect(flown).toEqual(projected);
    remaining.forEach((segment) => expect(segment.length).toBe(0));
  });

  it('[M1-14] a flight that has not yet departed renders entirely dashed', () => {
    const projected = projectSegments(arcSegments(LAX, NYC), VIEWPORT, PADDING_RATIO);

    const { flown, remaining } = splitAtProgress(projected, 0);

    flown.forEach((segment) => expect(segment.length).toBe(0));
    expect(remaining).toEqual(projected);
  });

  it('[M1-14] never merges segments across the antimeridian seam when splitting a Tokyo to LA route', () => {
    const projected = projectSegments(arcSegments(TOKYO, LAX), VIEWPORT, PADDING_RATIO);
    expect(projected.length).toBe(2);

    for (const progress of [0.1, 0.5, 0.9]) {
      const { flown, remaining } = splitAtProgress(projected, progress);

      expect(flown.length).toBe(2);
      expect(remaining.length).toBe(2);
      projected.forEach((segment, i) => {
        // The flown and remaining halves of segment i must together retrace
        // exactly that segment's own length — never spilling into, merging
        // with, or dropping any of segment i's neighbour.
        expect(totalLength([flown[i]!]) + totalLength([remaining[i]!])).toBeCloseTo(totalLength([segment]), 6);
      });
    }
  });

  it('[M1-14] clamps progress outside [0, 1] instead of extrapolating past either end', () => {
    const projected = projectSegments(arcSegments(LAX, NYC), VIEWPORT, PADDING_RATIO);

    expect(splitAtProgress(projected, 1.5).flown).toEqual(projected);
    expect(splitAtProgress(projected, -0.5).remaining).toEqual(projected);
  });

  it('[M1-14] renders entirely dashed rather than dividing by zero on a zero-length route', () => {
    const projected = projectSegments(arcSegments(LAX, LAX), VIEWPORT, PADDING_RATIO);

    const { flown, remaining } = splitAtProgress(projected, 0.5);

    flown.forEach((segment) => expect(segment.length).toBe(0));
    expect(remaining).toEqual(projected);
  });
});

describe('projectPoint', () => {
  const T0 = 1_770_000_000_000;
  const plan = planFlight({ origin: LAX, destination: NYC, departsAtMs: T0, seed: 7 });
  const f = plan.pub;
  const totalMs = f.arrivesAtMs - f.departsAtMs;
  const segments = arcSegments(LAX, NYC);

  it("[M1-15] a bird at 40% of elapsed time on a LA to NYC flight projects within 1% of viewport size of interpolate(origin, destination, 0.4)'s own point, projected through the same fit", () => {
    const state = flightStateAt(f, T0 + totalMs * 0.4);
    const expected = projectPoint(interpolate(LAX, NYC, 0.4), segments, VIEWPORT, PADDING_RATIO);
    const actual = projectPoint(state.position, segments, VIEWPORT, PADDING_RATIO);

    const viewportSize = Math.max(VIEWPORT.width, VIEWPORT.height);
    expect(Math.hypot(actual.x - expected.x, actual.y - expected.y)).toBeLessThan(viewportSize * 0.01);
  });

  it("[M1-15] advancing a frozen clock by one hour on a 22-hour flight moves the projected point roughly 4.5% of the route's total screen-space length further along it", () => {
    const projected = projectSegments(segments, VIEWPORT, PADDING_RATIO);
    const total = totalLength(projected);
    const hourMs = 3_600_000;
    const t = T0 + totalMs * 0.3;

    const before = projectPoint(flightStateAt(f, t).position, segments, VIEWPORT, PADDING_RATIO);
    const after = projectPoint(flightStateAt(f, t + hourMs).position, segments, VIEWPORT, PADDING_RATIO);
    const delta = Math.hypot(after.x - before.x, after.y - before.y);

    expect(delta / total).toBeGreaterThan(0.03);
    expect(delta / total).toBeLessThan(0.06);
  });

  it('[M1-15] calling the projector at two different timestamps that are both at or after arrivesAtMs returns the identical pinned destination point (arrived, no replay, no drift between calls)', () => {
    const first = projectPoint(flightStateAt(f, f.arrivesAtMs).position, segments, VIEWPORT, PADDING_RATIO);
    const second = projectPoint(flightStateAt(f, f.arrivesAtMs + 86_400_000).position, segments, VIEWPORT, PADDING_RATIO);

    expect(second).toEqual(first);
    expect(first).toEqual(projectPoint(NYC, segments, VIEWPORT, PADDING_RATIO));
  });

  it('[M1-15] throws rather than silently projecting to an infinite point when segments is empty', () => {
    expect(() => projectPoint(LAX, [], VIEWPORT, PADDING_RATIO)).toThrow();
  });

  it('[M1-15] projects a point crossing the antimeridian into the same fit as the route without exploding off-screen', () => {
    const tokyoLaxSegments = arcSegments(TOKYO, LAX);
    const midpoint = interpolate(TOKYO, LAX, 0.5);

    const projected = projectPoint(midpoint, tokyoLaxSegments, VIEWPORT, PADDING_RATIO);

    expect(Number.isFinite(projected.x)).toBe(true);
    expect(Number.isFinite(projected.y)).toBe(true);
    expect(projected.x).toBeGreaterThanOrEqual(0);
    expect(projected.x).toBeLessThanOrEqual(VIEWPORT.width);
  });
});

describe('maxZoomForMinVisibleKm', () => {
  // Independent of `computeFit`'s own internals: derives the same
  // pixel-per-degree scale `projectSegments` actually drew with by measuring
  // it off two of that route's own projected points, rather than trusting
  // `maxZoomForMinVisibleKm`'s internal formula to check itself.
  function measuredScale(rawSegments: readonly (readonly LatLng[])[], projected: readonly (readonly ProjectedPoint[])[]) {
    const a = rawSegments[0]![0]!;
    const b = rawSegments[0]![1]!;
    const pa = projected[0]![0]!;
    const pb = projected[0]![1]!;
    const pixelDistance = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    const degreeDistance = Math.hypot(b.lon - a.lon, b.lat - a.lat);
    return pixelDistance / degreeDistance;
  }

  it("[M1-17] at the returned maximum zoom, a LA to NYC route's narrower visible dimension is exactly minVisibleKm", () => {
    const segments = arcSegments(LAX, NYC);
    const minVisibleKm = 25;

    const maxZoom = maxZoomForMinVisibleKm(segments, VIEWPORT, PADDING_RATIO, minVisibleKm);
    const projected = projectSegments(segments, VIEWPORT, PADDING_RATIO);
    const scale = measuredScale(segments, projected);

    const allPoints = segments.flat();
    const centerLat = (Math.min(...allPoints.map((p) => p.lat)) + Math.max(...allPoints.map((p) => p.lat))) / 2;
    const centerLon = (Math.min(...allPoints.map((p) => p.lon)) + Math.max(...allPoints.map((p) => p.lon))) / 2;
    const lonWindowDeg = VIEWPORT.width / scale;
    const latWindowDeg = VIEWPORT.height / scale;

    const widthKm = haversineKm(
      { lat: centerLat, lon: centerLon - lonWindowDeg / 2 },
      { lat: centerLat, lon: centerLon + lonWindowDeg / 2 },
    );
    const heightKm = haversineKm(
      { lat: centerLat - latWindowDeg / 2, lon: centerLon },
      { lat: centerLat + latWindowDeg / 2, lon: centerLon },
    );
    const visibleSpanAtMaxZoom = Math.min(widthKm, heightKm) / maxZoom;

    expect(visibleSpanAtMaxZoom).toBeCloseTo(minVisibleKm, 6);
  });

  it('[M1-17] never returns less than 1 — it only bounds zooming in, never forces zooming out past the fit-to-bounds view', () => {
    const segments = arcSegments(LAX, NYC);

    // A minimum visible span far larger than the whole route already shows
    // at rest would otherwise drive the formula below 1.
    const maxZoom = maxZoomForMinVisibleKm(segments, VIEWPORT, PADDING_RATIO, 1_000_000);

    expect(maxZoom).toBe(1);
  });

  it('[M1-17] a stricter (larger) minimum visible span never allows more zoom than a looser (smaller) one', () => {
    const segments = arcSegments(LAX, NYC);

    const loose = maxZoomForMinVisibleKm(segments, VIEWPORT, PADDING_RATIO, 5);
    const strict = maxZoomForMinVisibleKm(segments, VIEWPORT, PADDING_RATIO, 25);

    expect(strict).toBeLessThan(loose);
  });

  it('[M1-17] a longer route (more to zoom into before hitting 25 km) allows more maximum zoom than a shorter one', () => {
    const short = maxZoomForMinVisibleKm(arcSegments(LAX, LAX_NEARBY), VIEWPORT, PADDING_RATIO, 25);
    const long = maxZoomForMinVisibleKm(arcSegments(LAX, NYC), VIEWPORT, PADDING_RATIO, 25);

    expect(long).toBeGreaterThan(short);
  });

  it('[M1-17] returns Infinity for an empty segments array rather than dividing by a zero-size fit', () => {
    expect(maxZoomForMinVisibleKm([], VIEWPORT, PADDING_RATIO, 25)).toBe(Infinity);
  });
});
