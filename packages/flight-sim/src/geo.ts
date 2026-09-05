import { R_EARTH_KM } from './constants';
import type { LatLng } from './types';

const rad = (d: number): number => (d * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

/**
 * Great-circle distance. Haversine rather than the spherical law of cosines
 * because the latter loses precision catastrophically at short distances —
 * and "across the room" is a supported route.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const la1 = rad(a.lat);
  const la2 = rad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Spherical linear interpolation along the great circle. `f` is clamped to
 * [0,1] so a caller cannot walk a bird off the end of its own route.
 */
export function interpolate(a: LatLng, b: LatLng, f: number): LatLng {
  const t = f < 0 ? 0 : f > 1 ? 1 : f;
  const d = haversineKm(a, b) / R_EARTH_KM;

  // Coincident endpoints: the path is a point.
  if (d < 1e-12) return { lat: a.lat, lon: a.lon };

  const sinD = Math.sin(d);

  // Antipodal endpoints: every great circle between them is equally valid, so
  // slerp is genuinely undefined (sin(d) -> 0). Fall back to linear blending,
  // which picks one of the infinitely many correct arcs rather than dividing
  // by zero and returning NaN.
  if (Math.abs(sinD) < 1e-12) {
    return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
  }

  const A = Math.sin((1 - t) * d) / sinD;
  const B = Math.sin(t * d) / sinD;
  const la1 = rad(a.lat);
  const lo1 = rad(a.lon);
  const la2 = rad(b.lat);
  const lo2 = rad(b.lon);

  const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
  const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
  const z = A * Math.sin(la1) + B * Math.sin(la2);

  return { lat: deg(Math.atan2(z, Math.hypot(x, y))), lon: deg(Math.atan2(y, x)) };
}

/** Forward azimuth from `a` to `b`, degrees clockwise from north, in [0,360). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const la1 = rad(a.lat);
  const la2 = rad(b.lat);
  const dLon = rad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Sample `steps + 1` evenly spaced points along the great circle. */
export function densify(a: LatLng, b: LatLng, steps: number): LatLng[] {
  const n = Math.max(1, Math.floor(steps));
  const out: LatLng[] = [];
  for (let i = 0; i <= n; i++) out.push(interpolate(a, b, i / n));
  return out;
}

/**
 * Split a sampled path wherever it crosses the antimeridian.
 *
 * Without this, a Tokyo -> Los Angeles route renders as a horizontal streak
 * straight back across the entire map, because the longitude jumps from +179
 * to -179 and the renderer joins them. This is the single most common bug in
 * great-circle map code, and it is guaranteed to be hit by real users.
 *
 * A crossing inserts a synthetic point at the seam (lon = +-180) on both
 * sides, linearly interpolated between the two samples that straddle it, so
 * every resulting segment still has at least two points and is drawable —
 * including the very first segment, when the crossing falls on the first
 * sample and the origin itself would otherwise be a lone, dropped point.
 */
export function splitAtAntimeridian(points: readonly LatLng[]): LatLng[][] {
  if (points.length === 0) return [];
  const segments: LatLng[][] = [[points[0]!]];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const jump = curr.lon - prev.lon;

    if (Math.abs(jump) > 180) {
      const sign = Math.sign(jump);
      const boundaryLon = -sign * 180;
      const unwrappedCurrLon = curr.lon - sign * 360;
      const denom = unwrappedCurrLon - prev.lon;
      // denom is ~0 when prev and curr already sit on opposite sides of the
      // exact seam (e.g. lon 180 followed by lon -180) — there is no real
      // longitude gap left to interpolate across, so fall back to prev's own
      // latitude rather than dividing by zero.
      const t = Math.abs(denom) > 1e-9 ? (boundaryLon - prev.lon) / denom : 0;
      const boundaryLat = prev.lat + t * (curr.lat - prev.lat);

      segments[segments.length - 1]!.push({ lat: boundaryLat, lon: boundaryLon });
      segments.push([{ lat: boundaryLat, lon: -boundaryLon }]);
    }

    segments[segments.length - 1]!.push(curr);
  }
  // Every segment built above already has >= 2 points; this only still
  // matters for the single-point-input case (points.length === 1).
  return segments.filter((s) => s.length > 1);
}

/**
 * How finely to sample an arc so it looks like a curve rather than a chord.
 * Longer routes bend more, so they need more points.
 */
export function recommendedSteps(a: LatLng, b: LatLng): number {
  const angularDeg = (haversineKm(a, b) / R_EARTH_KM) * (180 / Math.PI);
  return Math.min(512, Math.max(24, Math.ceil(angularDeg / 2)));
}

/** Convenience: the drawable, antimeridian-safe polyline for a route. */
export function arcSegments(a: LatLng, b: LatLng, steps?: number): LatLng[][] {
  return splitAtAntimeridian(densify(a, b, steps ?? recommendedSteps(a, b)));
}
