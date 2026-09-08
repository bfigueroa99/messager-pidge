/**
 * Product constants. Changing any of these is a product decision and requires
 * an ADR in docs/DECISIONS.md — they are the physics the fiction rests on.
 */

/** Mean Earth radius (IUGG). */
export const R_EARTH_KM = 6371.0088;

/**
 * The original app advertises 110 mph, and it checks out: Los Angeles to New
 * York is 3936 km, which at 110 mph is 22.2 hours — matching the reported
 * "LA to NYC takes 22 hrs" exactly.
 *
 * This is roughly twice a real homing pigeon (~80 km/h). That is deliberate:
 * at a realistic speed the same message takes 49 hours, and cross-country
 * messaging stops being funny and starts being unusable. See ADR-003.
 */
export const BASE_SPEED_MPH = 110;
export const BASE_SPEED_KMH = 177.02784;

/** Even a message across the room gets a release, a flight and an arrival. */
export const MIN_FLIGHT_MS = 90_000;

/** Hard ceiling. Sydney to London is ~4 days; we refuse to model more than 7. */
export const MAX_FLIGHT_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Constant hazard per kilometre, calibrated so a 1000 km flight carries the
 * original's 0.2% risk: -ln(1 - 0.002) / 1000.
 *
 * A flat per-flight probability would make a message across town exactly as
 * dangerous as crossing the Atlantic, which is both boring and wrong. Under
 * this model ambition costs something. See ADR-005.
 */
export const BASE_HAZARD_PER_KM = 2.002e-6;

/** No single flight is ever more than this dangerous, however brutal the route. */
export const MAX_DEATH_PROBABILITY = 0.08;

/** Wind never dominates; it colours the journey. */
export const MAX_WIND_COMPONENT_KMH = 25;

/**
 * Bumping this lets the model evolve without retroactively changing the fate
 * of birds already in the air. Stored per-flight in the database.
 */
export const SIM_VERSION = 1;

export const DEFAULT_CONDITIONS = {
  windComponentKmh: 0,
  stormIntensity: 0,
  predatorPressure: 0,
} as const;
