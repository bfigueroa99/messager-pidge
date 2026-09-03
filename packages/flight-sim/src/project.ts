import { haversineKm } from './geo';
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
 * The scale/origin derivation `projectSegments` fits a route to, shared with
 * `projectPoint` so a marker's own position can never drift from the route's
 * fit — the two functions call this once, never re-derive it independently.
 */
interface Fit {
  readonly scale: number;
  readonly originX: number;
  readonly originY: number;
  readonly minLon: number;
  readonly maxLon: number;
  readonly minLat: number;
  readonly maxLat: number;
  readonly unwrappedLons: readonly (readonly number[])[];
}

function computeFit(
  segments: readonly (readonly LatLng[])[],
  viewport: Viewport,
  paddingRatio: number,
): Fit {
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

  return { scale, originX, originY, minLon, maxLon, minLat, maxLat, unwrappedLons };
}

/**
 * Brings `lon` (a raw geographic longitude in [-180, 180)) into the same
 * unwrapped coordinate space `computeFit` reconstructed for the route's
 * segments, so a point that lies on the route can be located inside
 * `[fit.minLon, fit.maxLon]` even when that range extends past ±180 at an
 * antimeridian crossing. Tries the raw value and both neighbouring 360°
 * wraps and keeps whichever lands closest to the fit's own centre — exactly
 * one candidate can, since the route this point sits on is the same route
 * that produced the fit.
 */
function unwrapLonToFit(lon: number, fit: Pick<Fit, 'minLon' | 'maxLon'>): number {
  const center = (fit.minLon + fit.maxLon) / 2;
  let best = lon;
  let bestDistance = Math.abs(lon - center);
  for (const candidate of [lon - 360, lon + 360]) {
    const distance = Math.abs(candidate - center);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
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

  const fit = computeFit(segments, viewport, paddingRatio);

  return segments.map((segment, segmentIndex) =>
    segment.map((point, pointIndex) => ({
      x: fit.originX + (fit.unwrappedLons[segmentIndex]![pointIndex]! - fit.minLon) * fit.scale,
      y: fit.originY + (fit.maxLat - point.lat) * fit.scale,
    })),
  );
}

/**
 * Projects a single point — `flightStateAt`'s own real geo-space `position`,
 * never a screen-space length fraction — through the identical fit
 * `projectSegments` computes for `segments`, so the bird's marker and the
 * drawn route always agree on scale and origin. `segments` must be the same
 * `arcSegments()` output the route itself is drawn from; passing a different
 * route's segments would fit the point to the wrong scale.
 *
 * Throws on an empty `segments` array rather than silently returning an
 * infinite point (`Math.min`/`Math.max` over nothing) — a wrong marker
 * position that fails loudly is safer than one that fails invisibly,
 * matching this codebase's own precedent (`snap_profile_location` raising
 * rather than nulling a coordinate it cannot resolve).
 */
export function projectPoint(
  point: LatLng,
  segments: readonly (readonly LatLng[])[],
  viewport: Viewport,
  paddingRatio: number,
): ProjectedPoint {
  if (segments.length === 0) {
    throw new Error('projectPoint: segments must be non-empty — nothing to fit the point against');
  }

  const fit = computeFit(segments, viewport, paddingRatio);
  const lon = unwrapLonToFit(point.lon, fit);

  return {
    x: fit.originX + (lon - fit.minLon) * fit.scale,
    y: fit.originY + (fit.maxLat - point.lat) * fit.scale,
  };
}

/**
 * The greatest zoom factor `FlightMap` may apply while the user pinches in
 * before the geographic span visible across the *whole* viewport (not just
 * the route's own bounding box — the padding margin is still on-screen too)
 * would shrink under `minVisibleKm`. Computed from the identical fit
 * `projectSegments`/`projectPoint` share, so it always agrees with what is
 * actually drawn. `PRODUCT.md` §9's "we never store a precise location"
 * promise would otherwise be underminable at the UI layer alone: pinching a
 * route down to street-level detail makes the loft's city-centroid snap feel
 * broken even though the stored coordinate itself is still coarse.
 *
 * A single shared pixel-per-degree `scale` maps both axes (see `computeFit`),
 * so the viewport's unzoomed window in degrees is `viewport.{width,height} /
 * fit.scale` on each axis; zooming by `Z` shrinks both windows by the same
 * `1/Z`. The window nearer the pole (in km) is the one that binds first, so
 * this measures both axes at the fit's own center latitude and returns
 * whichever is smaller.
 *
 * Never returns less than 1: `M1-12`'s own fit-to-bounds view is the resting
 * zoom, and this only bounds zooming *in* past it — it never forces a route
 * that is already short of `minVisibleKm` at rest to zoom out further.
 */
export function maxZoomForMinVisibleKm(
  segments: readonly (readonly LatLng[])[],
  viewport: Viewport,
  paddingRatio: number,
  minVisibleKm: number,
): number {
  if (segments.length === 0) return Infinity;

  const fit = computeFit(segments, viewport, paddingRatio);
  const centerLat = (fit.minLat + fit.maxLat) / 2;
  const centerLon = (fit.minLon + fit.maxLon) / 2;
  const lonWindowDeg = viewport.width / fit.scale;
  const latWindowDeg = viewport.height / fit.scale;

  const widthKm = haversineKm(
    { lat: centerLat, lon: centerLon - lonWindowDeg / 2 },
    { lat: centerLat, lon: centerLon + lonWindowDeg / 2 },
  );
  const heightKm = haversineKm(
    { lat: centerLat - latWindowDeg / 2, lon: centerLon },
    { lat: centerLat + latWindowDeg / 2, lon: centerLon },
  );

  return Math.max(1, Math.min(widthKm, heightKm) / minVisibleKm);
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
