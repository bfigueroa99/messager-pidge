#!/usr/bin/env node
/**
 * Gate: the test-count ratchet.
 *
 * An agent under pressure to get green will delete or skip the inconvenient
 * test. This makes that impossible to do quietly: the declared test count may
 * never fall below the floor recorded in .loop/state.json, and lowering the
 * floor is a visible edit in the diff.
 *
 * It also rejects `.skip` and `.only` outright — a skipped test is a deleted
 * test wearing a disguise, and a lone `.only` silently disables everything else.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_PATH = join(ROOT, '.loop', 'state.json');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.expo']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
let count = 0;
const violations = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  count += (src.match(/^\s*(?:it|test)\s*\(/gm) ?? []).length;

  for (const bad of ['it.skip', 'test.skip', 'describe.skip', 'it.only', 'test.only', 'describe.only', 'xit(', 'xdescribe(']) {
    if (src.includes(bad)) violations.push(`${relative(ROOT, file)} contains ${bad}`);
  }
}

if (violations.length > 0) {
  console.error('\ngate:tests FAILED — skipped or exclusive tests are not allowed\n');
  for (const v of violations) console.error(`  ✗ ${v}`);
  console.error('\nFix the test or delete it deliberately in its own roadmap item.\n');
  process.exit(1);
}

const state = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
const floor = state.test_count_floor ?? 0;

if (count < floor) {
  console.error(
    `\ngate:tests FAILED — ${count} tests declared, floor is ${floor}.\n\n` +
      `Tests were removed. If that was deliberate, lower test_count_floor in\n` +
      `.loop/state.json in the same commit so the change is visible in review.\n`,
  );
  process.exit(1);
}

// Ratchet up automatically so the floor tracks the high-water mark.
if (count > floor && process.env.CI !== 'true') {
  state.test_count_floor = count;
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
  console.log(`gate:tests ok — ${count} tests (floor raised from ${floor})`);
} else {
  console.log(`gate:tests ok — ${count} tests (floor ${floor})`);
}
