#!/usr/bin/env node
/**
 * Prints `scripts/demo-harness.mjs`'s `planDemoFlight` result for a
 * `departsAtMs` piped in on stdin, as JSON. A plain `node` process, the same
 * reason `tests/scripts/run-bundled-plan.mjs` (M1-02) exists — a ts-jest
 * test cannot `import()` an ESM-only file directly under this repo's
 * CommonJS module target.
 */
import { planDemoFlight } from '../../scripts/demo-harness.mjs';

let input = '';
for await (const chunk of process.stdin) input += chunk;

const plan = planDemoFlight(Number(input.trim()));
process.stdout.write(JSON.stringify(plan));
