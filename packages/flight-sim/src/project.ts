import { clamp } from './speed';
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
  const clampedPaddingRatio = clamp(paddingRatio, 0, 0.49);
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

/** `projectSegments()`'s output, partitioned at a point along the route. */
export interface ProgressSplitSegments {
  /** The portion of each segment already flown, up to the split point. */
  readonly flown: readonly (readonly ProjectedPoint[])[];
  /** The portion of each segment not yet flown, from the split point on. */
  readonly remaining: readonly (readonly ProjectedPoint[])[];
}

/** `segments`, passed through unchanged as the flown side; empty on the remaining side. */
function allFlown(segments: readonly (readonly ProjectedPoint[])[]): ProgressSplitSegments {
  return { flown: segments, remaining: segments.map(() => []) };
}

/** `segments`, passed through unchanged as the remaining side; empty on the flown side. */
function allRemaining(segments: readonly (readonly ProjectedPoint[])[]): ProgressSplitSegments {
  return { flown: segments.map(() => []), remaining: segments };
}

function distance(a: ProjectedPoint, b: ProjectedPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function segmentLength(segment: readonly ProjectedPoint[]): number {
  let length = 0;
  for (let i = 1; i < segment.length; i++) length += distance(segment[i - 1]!, segment[i]!);
  return length;
}

/**
 * Splits a segment's points at `targetLength` (screen-space distance along
 * this segment alone), inserting one linearly-interpolated point shared by
 * both halves so the flown and remaining polylines meet exactly at the split
 * — never overlapping, never leaving a gap.
 */
function splitSegment(
  segment: readonly ProjectedPoint[],
  targetLength: number,
): { flown: ProjectedPoint[]; remaining: ProjectedPoint[] } {
  if (segment.length === 0) return { flown: [], remaining: [] };

  const flown: ProjectedPoint[] = [segment[0]!];
  let cumulative = 0;
  for (let i = 1; i < segment.length; i++) {
    const prev = segment[i - 1]!;
    const curr = segment[i]!;
    const stepLength = distance(prev, curr);
    if (cumulative + stepLength >= targetLength) {
      const t = stepLength === 0 ? 0 : (targetLength - cumulative) / stepLength;
      const splitPoint: ProjectedPoint = { x: prev.x + (curr.x - prev.x) * t, y: prev.y + (curr.y - prev.y) * t };
      flown.push(splitPoint);
      return { flown, remaining: [splitPoint, ...segment.slice(i)] };
    }
    flown.push(curr);
    cumulative += stepLength;
  }
  // `targetLength` should never exceed this segment's own length, by
  // splitAtProgress's own invariant — but that invariant compares a sum of
  // independently-accumulated segment lengths against `totalLength * progress`,
  // a different floating-point computation, so it is not bit-exact. Falling
  // back to "the whole segment is flown" here (rather than throwing) is the
  // same clamp-not-crash choice `projectSegments` already makes for an
  // out-of-range `paddingRatio`.
  return { flown: [...segment], remaining: [] };
}

/**
 * Partitions `projectSegments()`'s output into a flown prefix and a
 * remaining suffix at `progress` (a 0..1 fraction of the route's total
 * screen-space length, from `flightStateAt`'s own `progress` field — never
 * `Date.now()`). Segments are never merged or reordered: at most one input
 * segment straddles the split point and is itself split there; every other
 * segment is passed through whole to whichever side it falls on. This keeps
 * `M1-12`'s antimeridian guarantee intact — a split route still never draws a
 * point connecting across the seam, on either side of the flown/remaining
 * divide.
 */
export function splitAtProgress(
  segments: readonly (readonly ProjectedPoint[])[],
  progress: number,
): ProgressSplitSegments {
  const clamped = clamp(progress, 0, 1);

  if (clamped >= 1) return allFlown(segments);
  if (clamped <= 0) return allRemaining(segments);

  const lengths = segments.map(segmentLength);
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  if (totalLength <= 0) return allRemaining(segments);

  const targetLength = totalLength * clamped;
  const flown: (readonly ProjectedPoint[])[] = [];
  const remaining: (readonly ProjectedPoint[])[] = [];
  let consumed = 0;
  let splitAt = -1;

  segments.forEach((segment, i) => {
    if (splitAt >= 0) {
      flown.push([]);
      remaining.push(segment);
      return;
    }
    if (consumed + lengths[i]! <= targetLength) {
      flown.push(segment);
      remaining.push([]);
      consumed += lengths[i]!;
      return;
    }
    const split = splitSegment(segment, targetLength - consumed);
    flown.push(split.flown);
    remaining.push(split.remaining);
    splitAt = i;
  });

  return { flown, remaining };
}
