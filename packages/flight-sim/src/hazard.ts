import { BASE_HAZARD_PER_KM, MAX_DEATH_PROBABILITY } from './constants';
import { clamp } from './speed';
import type { DeathCause, LatLng } from './types';

export interface HazardInput {
  readonly distanceKm: number;
  /** 0..1 */
  readonly stormIntensity: number;
  /** 0..1 */
  readonly predatorPressure: number;
  readonly isFirstEverFlight: boolean;
}

/**
 * Probability that a bird does not arrive.
 *
 * Modelled as a constant hazard per kilometre rather than the original's flat
 * per-flight chance, so that distance is the thing that costs you. Storms and
 * predator corridors raise the rate; nothing lowers it below zero.
 */
export function deathProbability(i: HazardInput): number {
  if (i.isFirstEverFlight) return 0;
  if (i.distanceKm <= 0) return 0;

  const lambda =
    BASE_HAZARD_PER_KM *
    (1 + 1.5 * clamp(i.stormIntensity, 0, 1)) *
    (1 + 1.0 * clamp(i.predatorPressure, 0, 1));

  return Math.min(MAX_DEATH_PROBABILITY, 1 - Math.exp(-lambda * i.distanceKm));
}

/**
 * Where along the route it happens, as a fraction in (0,1).
 *
 * Two uniform draws averaged approximates a Beta(2,2): deaths cluster toward
 * the middle of the journey. A bird that dies fifty feet from the loft reads
 * as a bug; one that dies over Nebraska reads as a story.
 */
export function sampleDeathFraction(rand: () => number): number {
  const f = (rand() + rand()) / 2;
  return clamp(f, 0.02, 0.98);
}

/**
 * Cause of death, conditioned on where the bird fell. Over open water there is
 * nothing to hunt it and nothing to hit, so it is exhaustion or navigation;
 * over land the world is full of hazards.
 *
 * `isOverWater` is supplied by the caller — the engine holds no map data,
 * because it must stay dependency-free. Callers without coastline data can
 * pass `false` and get land causes.
 */
export function pickCause(rand: () => number, at: LatLng, isOverWater: boolean): DeathCause {
  const table: readonly (readonly [DeathCause, number])[] = isOverWater
    ? [
        ['exhaustion', 0.5],
        ['lost_bearings', 0.35],
        ['storm', 0.15],
      ]
    : [
        ['hawk', 0.4],
        ['storm', 0.2],
        ['exhaustion', 0.15],
        ['window', 0.12],
        ['cat', 0.08],
        ['lost_bearings', 0.05],
      ];

  // High latitudes have fewer raptors and worse weather; nudge accordingly.
  const polar = Math.abs(at.lat) > 60;
  const weights = table.map(([cause, w]) =>
    polar && cause === 'hawk' ? ([cause, w * 0.3] as const) : ([cause, w] as const),
  );

  const total = weights.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [cause, w] of weights) {
    r -= w;
    if (r <= 0) return cause;
  }
  return weights[weights.length - 1]?.[0] ?? 'exhaustion';
}
