import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { planFlight } from '../packages/flight-sim/src/index';
import type { PlanInput } from '../packages/flight-sim/src/index';

/**
 * `[M1-02]` `supabase/functions/_shared/flight-sim.js` is an esbuild bundle
 * of `packages/flight-sim` (`pnpm run build:engine`, `scripts/build-engine.mjs`),
 * committed so the Deno Edge Function can import it without a pnpm workspace.
 * ADR-001 says the flight math must have exactly one implementation — this
 * proves the bundle and the source agree, rather than trusting the bundler.
 */
const RUN_BUNDLED_PLAN_SCRIPT = join(__dirname, 'scripts', 'run-bundled-plan.mjs');

function planViaBundle(input: PlanInput): unknown {
  const output = execFileSync(process.execPath, [RUN_BUNDLED_PLAN_SCRIPT], {
    input: JSON.stringify(input),
    encoding: 'utf8',
  });
  return JSON.parse(output);
}

describe('the bundled engine', () => {
  it('[M1-02] the bundled engine returns the same arrival time as the Node engine for LA to NYC', () => {
    const input: PlanInput = {
      origin: { lat: 34.0522, lon: -118.2437 },
      destination: { lat: 40.7128, lon: -74.006 },
      departsAtMs: 1_700_000_000_000,
      seed: 42,
    };

    const nodePlan = planFlight(input);
    const bundledPlan = planViaBundle(input) as { pub: { arrivesAtMs: number; distanceKm: number } };

    expect(bundledPlan.pub.arrivesAtMs).toBe(nodePlan.pub.arrivesAtMs);
    expect(bundledPlan.pub.distanceKm).toBe(nodePlan.pub.distanceKm);
  });
});
