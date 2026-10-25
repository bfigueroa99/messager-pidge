import { DEFAULT_CONDITIONS, SIM_VERSION } from './constants';
import { bearingDeg, haversineKm, interpolate } from './geo';
import { deathProbability, pickCause, sampleDeathFraction } from './hazard';
import { streamFor } from './rng';
import { durationMs, effectiveSpeedKmh } from './speed';
import type { FlightPlan, PlanInput, RouteConditions } from './types';

/**
 * Plan a flight. **Server-side only.**
 *
 * Every dice roll happens here, once, at release: whether the bird survives,
 * when and where it falls, and why. The result is split in two — a `pub` half
 * safe to hand the client immediately, and a `secret` half that must not reach
 * anyone until the moment it happens.
 *
 * This is what makes hour 19 of a 22-hour flight exactly right: the client is
 * a pure renderer of a decision the server already made, so there is nothing
 * to drift, re-roll on reconnect, or disagree about.
 *
 * Pure: no clock, no randomness beyond the seeded streams, no I/O.
 */
export function planFlight(input: PlanInput): FlightPlan {
  const conditions: RouteConditions = { ...DEFAULT_CONDITIONS, ...input.conditions };

  const distanceKm = haversineKm(input.origin, input.destination);
  const speedKmh = effectiveSpeedKmh({
    windComponentKmh: conditions.windComponentKmh,
    stormIntensity: conditions.stormIntensity,
    distanceKm,
  });

  const totalMs = durationMs(distanceKm, speedKmh);
  const arrivesAtMs = input.departsAtMs + totalMs;

  const pub = {
    origin: input.origin,
    destination: input.destination,
    departsAtMs: input.departsAtMs,
    arrivesAtMs,
    distanceKm,
    initialBearingDeg: bearingDeg(input.origin, input.destination),
    effectiveSpeedKmh: speedKmh,
    simVersion: SIM_VERSION,
  };

  const pDeath = deathProbability({
    distanceKm,
    stormIntensity: conditions.stormIntensity,
    predatorPressure: conditions.predatorPressure,
    isFirstEverFlight: input.isFirstEverFlight === true,
  });

  const survives = streamFor(input.seed, 'survival')() >= pDeath;

  if (survives) {
    return {
      pub,
      secret: {
        outcome: 'delivered',
        deathAtMs: null,
        deathFraction: null,
        deathPoint: null,
        cause: null,
        resolveAtMs: arrivesAtMs,
      },
    };
  }

  const fraction = sampleDeathFraction(streamFor(input.seed, 'death'));
  const deathAtMs = input.departsAtMs + totalMs * fraction;
  const deathPoint = interpolate(input.origin, input.destination, fraction);

  // The engine carries no coastline data (it must stay dependency-free), so
  // "over water" is left to the caller to refine. Land causes are the default.
  const cause = pickCause(streamFor(input.seed, 'cause'), deathPoint, false);

  return {
    pub,
    secret: {
      outcome: 'died',
      deathAtMs,
      deathFraction: fraction,
      deathPoint,
      cause,
      resolveAtMs: deathAtMs,
    },
  };
}
