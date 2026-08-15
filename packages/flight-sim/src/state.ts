import { bearingDeg, interpolate } from './geo';
import type { FlightState, PublicFlight } from './types';

/**
 * Where the bird is right now.
 *
 * A pure function of the flight and a timestamp — which is why a client in
 * aeroplane mode renders a perfectly correct pigeon for 22 hours, and why
 * reopening the app never replays or rewinds a journey. `nowMs` must come from
 * the server-corrected clock, never `Date.now()`: a device with a wrong clock
 * gains nothing (the database gates on its own `now()`) but would see a bird
 * that has already landed or is flying backwards.
 *
 * Note this reports `arrived` for any flight past its arrival time. A bird
 * that died is only known to have died once the server says so — the client is
 * deliberately not told in advance, so it cannot render a fate it should not
 * know. Callers merge the resolved outcome in when it arrives.
 */
export function flightStateAt(f: PublicFlight, nowMs: number): FlightState {
  const totalMs = f.arrivesAtMs - f.departsAtMs;

  if (nowMs <= f.departsAtMs) {
    return {
      phase: nowMs < f.departsAtMs ? 'scheduled' : 'in_flight',
      progress: 0,
      position: f.origin,
      headingDeg: f.initialBearingDeg,
      remainingMs: Math.max(0, f.arrivesAtMs - nowMs),
      remainingKm: f.distanceKm,
    };
  }

  if (nowMs >= f.arrivesAtMs) {
    return {
      phase: 'arrived',
      progress: 1,
      position: f.destination,
      headingDeg: bearingDeg(f.origin, f.destination),
      remainingMs: 0,
      remainingKm: 0,
    };
  }

  const progress = totalMs <= 0 ? 1 : (nowMs - f.departsAtMs) / totalMs;
  const position = interpolate(f.origin, f.destination, progress);

  // Heading from a short lookahead so the sprite rotates along the arc rather
  // than pointing at the destination in a straight line.
  const ahead = interpolate(f.origin, f.destination, Math.min(1, progress + 0.001));

  return {
    phase: 'in_flight',
    progress,
    position,
    headingDeg: bearingDeg(position, ahead),
    remainingMs: f.arrivesAtMs - nowMs,
    remainingKm: f.distanceKm * (1 - progress),
  };
}

/**
 * Where the bird stopped, for a flight the server has told us was lost.
 * The position is pinned forever — it does not drift on toward the
 * destination it never reached.
 */
export function lostStateAt(f: PublicFlight, deathFraction: number): FlightState {
  const position = interpolate(f.origin, f.destination, deathFraction);
  const ahead = interpolate(f.origin, f.destination, Math.min(1, deathFraction + 0.001));
  return {
    phase: 'lost',
    progress: deathFraction,
    position,
    headingDeg: bearingDeg(position, ahead),
    remainingMs: 0,
    remainingKm: f.distanceKm * (1 - deathFraction),
  };
}
