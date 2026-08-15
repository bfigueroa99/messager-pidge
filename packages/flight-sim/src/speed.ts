import {
  BASE_SPEED_KMH,
  MAX_FLIGHT_MS,
  MAX_WIND_COMPONENT_KMH,
  MIN_FLIGHT_MS,
} from './constants';

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export interface SpeedInput {
  /** Positive tailwind / negative headwind, km/h, already projected onto the course. */
  readonly windComponentKmh: number;
  /** 0..1 */
  readonly stormIntensity: number;
  readonly distanceKm: number;
}

/**
 * Cruise speed for one flight.
 *
 * Storms slow a bird down; very long hauls sag a little as it tires. Both are
 * bounded so weather can never turn a 22-hour flight into a 60-hour one — the
 * wait is the product, but an unpredictable wait is just a broken app.
 */
export function effectiveSpeedKmh(i: SpeedInput): number {
  const storm = clamp(1 - 0.35 * clamp(i.stormIntensity, 0, 1), 0.5, 1);

  // Asymptotic fatigue: negligible under ~500 km, approaching -15% past ~5000 km.
  const fatigue = clamp(1 - 0.15 * (1 - Math.exp(-Math.max(0, i.distanceKm) / 5000)), 0.7, 1);

  const wind = clamp(i.windComponentKmh, -MAX_WIND_COMPONENT_KMH, MAX_WIND_COMPONENT_KMH);

  return Math.max(20, BASE_SPEED_KMH * storm * fatigue + wind);
}

/** Flight duration, clamped to the product's floor and ceiling. */
export function durationMs(distanceKm: number, speedKmh: number): number {
  const raw = (Math.max(0, distanceKm) / Math.max(1, speedKmh)) * 3_600_000;
  return clamp(raw, MIN_FLIGHT_MS, MAX_FLIGHT_MS);
}
