import type { LatLng } from './types';

/** Pixel dimensions of the surface the route is drawn into. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** A point in screen space. Origin top-left; y increases downward. */
export interface ProjectedPoint {
  readonly x: number;
  readonly y: number;
}

/** Degenerate spans (a near-zero-distance hop) would otherwise divide by zero. */
const MIN_SPAN_DEG = 1e-6;

/**
 * Reconstructs a continuous longitude across a set of antimeridian-split
 * segments, so the true geographic bounding box can be measured even though
 * consecutive segments jump from +180 to -180 at the seam. `splitAtAntimeridian`
 * guarantees no such jump exists *within* a segment — only between one
 * segment's last point and the next segment's first point, which is exactly
 * where this looks for one.
 */
function unwrapLongitudes(segments: readonly (readonly LatLng[])[]): number[][] {
  const unwrapped: number[][] = [];
  let offsetDeg = 0;
  let prevLon: number | undefined;
  for (const segment of segments) {
    const lons: number[] = [];
    for (const point of segment) {
      if (prevLon !== undefined && Math.abs(point.lon - prevLon) > 180) {
        offsetDeg += point.lon - prevLon > 0 ? -360 : 360;
      }
      lons.push(point.lon + offsetDeg);
      prevLon = point.lon;
    }
    unwrapped.push(lons);
  }
  return unwrapped;
}

/**
 * Projects `arcSegments()`'s antimeridian-split output into screen space,
 * fit to `viewport` with `paddingRatio` of margin reserved on every side
 * regardless of route length — a 5 mi hop and a 10,000 mi crossing both get
 * the same visual margin. Segments are never merged: each input segment
 * produces its own output array, so a split route never produces a point
 * connecting across the seam.
 */
export function projectSegments(
  segments: readonly (readonly LatLng[])[],
  viewport: Viewport,
  paddingRatio: number,
): ProjectedPoint[][] {
  if (segments.length === 0) return [];

  const unwrappedLons = unwrapLongitudes(segments);
  const allLats = segments.flatMap((segment) => segment.map((point) => point.lat));
  const allLons = unwrappedLons.flat();

  const minLat = Math.min(...allLats);
  const maxLat = Math.max(...allLats);
  const minLon = Math.min(...allLons);
  const maxLon = Math.max(...allLons);

  const spanLat = Math.max(maxLat - minLat, MIN_SPAN_DEG);
  const spanLon = Math.max(maxLon - minLon, MIN_SPAN_DEG);

  // Clamp rather than trust the caller — matches `interpolate`'s own clamp of
  // `f` in geo.ts. An out-of-range ratio (>= 0.5 leaves nothing to draw into,
  // negative reserves no margin at all) would otherwise flip or collapse the
  // whole route instead of merely under- or over-padding it.
  const clampedPaddingRatio = Math.min(Math.max(paddingRatio, 0), 0.49);
  const drawableWidth = viewport.width * (1 - 2 * clampedPaddingRatio);
  const drawableHeight = viewport.height * (1 - 2 * clampedPaddingRatio);
  // A single shared scale for both axes — an independent x/y scale would
  // distort the route's true curvature instead of merely fitting it.
  const scale = Math.min(drawableWidth / spanLon, drawableHeight / spanLat);

  const originX = (viewport.width - spanLon * scale) / 2;
  const originY = (viewport.height - spanLat * scale) / 2;

  return segments.map((segment, segmentIndex) =>
    segment.map((point, pointIndex) => ({
      x: originX + (unwrappedLons[segmentIndex]![pointIndex]! - minLon) * scale,
      y: originY + (maxLat - point.lat) * scale,
    })),
  );
}
