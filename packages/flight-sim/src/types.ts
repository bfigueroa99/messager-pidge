/** A point on the sphere, in degrees. */
export interface LatLng {
  readonly lat: number;
  readonly lon: number;
}

/** Why a bird did not arrive. Chosen from a table conditioned on where it fell. */
export type DeathCause = 'hawk' | 'storm' | 'exhaustion' | 'lost_bearings' | 'window' | 'cat';

export type FlightOutcome = 'delivered' | 'died';

export type FlightPhase = 'scheduled' | 'in_flight' | 'arrived' | 'lost';

/** Weather sampled along the route at plan time and baked into the flight. */
export interface RouteConditions {
  /**
   * Wind already projected onto the course: positive is a tailwind, negative a
   * headwind, in km/h. Clamped by the caller so weather stays flavour.
   */
  readonly windComponentKmh: number;
  /** 0 = clear, 1 = the worst storm we model. */
  readonly stormIntensity: number;
  /**
   * 0..1. Open ocean and known raptor corridors are more dangerous than a
   * suburb. Raises hazard without touching speed.
   */
  readonly predatorPressure: number;
}

export interface PlanInput {
  readonly origin: LatLng;
  readonly destination: LatLng;
  /** Epoch ms. Supplied by the server; never read from a clock in here. */
  readonly departsAtMs: number;
  /** Stable per-flight seed. Same seed + same input => same fate, forever. */
  readonly seed: number;
  readonly conditions?: Partial<RouteConditions>;
  /**
   * A user's very first bird never dies. Losing the tutorial pigeon teaches
   * the wrong lesson before the fiction has had a chance to land.
   */
  readonly isFirstEverFlight?: boolean;
}

/**
 * The half of the plan that is safe to hand to a client the moment the bird
 * is released. Deliberately contains no hint of the outcome.
 */
export interface PublicFlight {
  readonly origin: LatLng;
  readonly destination: LatLng;
  readonly departsAtMs: number;
  /** When it lands if it survives. The client renders against this. */
  readonly arrivesAtMs: number;
  readonly distanceKm: number;
  readonly initialBearingDeg: number;
  readonly effectiveSpeedKmh: number;
  readonly simVersion: number;
}

/**
 * The half that must never reach a client before it happens. Stored in
 * `flight_secrets`, a table with RLS on and zero policies.
 */
export interface FlightSecret {
  readonly outcome: FlightOutcome;
  readonly deathAtMs: number | null;
  readonly deathFraction: number | null;
  readonly deathPoint: LatLng | null;
  readonly cause: DeathCause | null;
  /** min(arrivesAtMs, deathAtMs) — the reaper's index key. */
  readonly resolveAtMs: number;
}

export interface FlightPlan {
  readonly pub: PublicFlight;
  readonly secret: FlightSecret;
}

/** What the client renders. A pure function of a PublicFlight and a clock. */
export interface FlightState {
  readonly phase: FlightPhase;
  /** 0..1, clamped. */
  readonly progress: number;
  readonly position: LatLng;
  readonly headingDeg: number;
  readonly remainingMs: number;
  readonly remainingKm: number;
}
