#!/usr/bin/env node
/**
 * Runs `planFlight` from the committed, bundled engine
 * (`supabase/functions/_shared/flight-sim.js`) with a `PlanInput` piped in on
 * stdin, and prints the resulting `FlightPlan` as JSON.
 *
 * A plain `node` process is what actually exercises the bundle the same way
 * Deno will: a native ESM `import` of the real file on disk. A ts-jest test
 * cannot do this import directly — `import()` under this repo's CommonJS
 * module target compiles to `require()`, which cannot load an ESM-only file
 * (the same seam `tests/scripts/lint-fixture.mjs` already works around for
 * `eslint.config.mjs`) — so `tests/build-engine.test.ts` spawns this script
 * instead. See M1-02.
 */
import { planFlight } from '../../supabase/functions/_shared/flight-sim.js';

let input = '';
for await (const chunk of process.stdin) input += chunk;

const plan = planFlight(JSON.parse(input));
process.stdout.write(JSON.stringify(plan));
