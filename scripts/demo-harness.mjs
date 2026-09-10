#!/usr/bin/env node
/**
 * `pnpm run demo:run` (M1-09). Plays one full LA→NYC flight end to end with
 * the real physics but a compressed clock, so a flight that would otherwise
 * take about a day plays out — and can be recorded — in well under a
 * minute. See `docs/DEMO_RECORDING.md` for what to point a camera at, and
 * when.
 *
 * Two fixed demo users, never drawn at random, so the run is reproducible:
 * Ana in Los Angeles releases a bird to Priya in New York. The seed is
 * fixed too, and the flight is planned as a user's first-ever flight —
 * guaranteed delivery (`docs/PRODUCT.md` §6) — so a demo run always plays
 * out the full flight rather than occasionally cutting short into a loss.
 *
 * Imports the committed, bundled engine
 * (`supabase/functions/_shared/flight-sim.js`) rather than
 * `packages/flight-sim/src` directly — a plain `node` process cannot import
 * a `.ts` file. `tests/scripts/run-bundled-plan.mjs` (M1-02) takes the same
 * approach for the same reason.
 */
import { fileURLToPath } from 'node:url';

import { planFlight } from '../supabase/functions/_shared/flight-sim.js';

const DEMO_SENDER_NAME = 'Ana';
const DEMO_RECIPIENT_NAME = 'Priya';
const DEMO_ORIGIN = { lat: 34.0522, lon: -118.2437 }; // Los Angeles
const DEMO_DESTINATION = { lat: 40.7128, lon: -74.006 }; // New York

/** Same seed, same `departsAtMs`, every run — see M0-03's own determinism precedent. */
export const DEMO_SEED = 42;

/** The scale this item's own acceptance criterion names: a 22-hour flight in ~55s. */
export const DEFAULT_TIME_SCALE = 1440;

export function planDemoFlight(departsAtMs) {
  return planFlight({
    origin: DEMO_ORIGIN,
    destination: DEMO_DESTINATION,
    departsAtMs,
    seed: DEMO_SEED,
    isFirstEverFlight: true,
  });
}

/**
 * What to watch for, as a fraction of the span from release to resolution —
 * not a fraction of wall-clock time, so these line up whatever `timeScale`
 * is chosen.
 */
export const RECORDING_CHECKLIST = [
  { fraction: 0, label: 'release — the compose screen confirms and the flight card appears' },
  { fraction: 0.25, label: 'a quarter flown — the route line is a quarter solid on the chart' },
  { fraction: 0.5, label: 'halfway — the flight card reads roughly half the original ETA' },
  { fraction: 0.75, label: 'three-quarters flown — the marker is closing on the destination' },
  { fraction: 1, label: 'resolution — delivered reveals the note, or lost shows the memorial' },
];

/**
 * Plans the demo flight, then waits out the release-to-resolution span in
 * real time divided by `timeScale` — the same conversion `scaledNow`
 * (`packages/flight-sim/src/clock.ts`) applies for a live screen, run here
 * against real timers instead. Logs each `RECORDING_CHECKLIST` entry as its
 * moment arrives. `sleep`/`log` are injectable so a test can drive this
 * without a real wait.
 */
export async function runDemo({
  timeScale = DEFAULT_TIME_SCALE,
  departsAtMs = Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = console.log,
} = {}) {
  const plan = planDemoFlight(departsAtMs);
  const resolutionSpanMs = plan.secret.resolveAtMs - plan.pub.departsAtMs;

  log(
    `Releasing ${DEMO_SENDER_NAME}'s bird toward ${DEMO_RECIPIENT_NAME}: ` +
      `${plan.pub.distanceKm.toFixed(0)} km, seed ${DEMO_SEED}, ` +
      `scale ${timeScale} (~${(resolutionSpanMs / timeScale / 1000).toFixed(1)}s real time).`,
  );

  let elapsedRealMs = 0;
  for (const entry of RECORDING_CHECKLIST) {
    const targetRealMs = (resolutionSpanMs * entry.fraction) / timeScale;
    await sleep(Math.max(0, targetRealMs - elapsedRealMs));
    elapsedRealMs = targetRealMs;
    log(`[${(entry.fraction * 100).toFixed(0)}%] ${entry.label}`);
  }

  log(plan.secret.outcome === 'delivered' ? 'Delivered.' : `Lost — ${plan.secret.cause}.`);
  return plan;
}

function main() {
  const scaleArg = process.argv.find((arg) => arg.startsWith('--scale='));
  const timeScale = scaleArg ? Number(scaleArg.slice('--scale='.length)) : DEFAULT_TIME_SCALE;
  return runDemo({ timeScale });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
