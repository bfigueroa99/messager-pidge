#!/usr/bin/env node
/**
 * Drives `runDemo` (`scripts/demo-harness.mjs`) with a fake, non-waiting
 * `sleep` and a log recorder instead of real timers, so its checklist
 * sequencing can be asserted without actually waiting out the flight. Same
 * ESM-import constraint as `run-demo-plan.mjs` — see its own comment.
 */
import { runDemo } from '../../scripts/demo-harness.mjs';

const lines = [];
const plan = await runDemo({
  departsAtMs: 1_700_000_000_000,
  timeScale: 1440,
  sleep: () => Promise.resolve(),
  log: (line) => lines.push(line),
});

process.stdout.write(JSON.stringify({ lines, outcome: plan.secret.outcome }));
