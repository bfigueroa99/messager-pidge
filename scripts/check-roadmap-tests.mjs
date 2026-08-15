#!/usr/bin/env node
/**
 * Gate: no checkbox without a test.
 *
 * The most common way an autonomous loop rots is marking things done that are
 * not. This script makes "done" mechanically checkable: every roadmap item with
 * status `done` must be covered by at least one test whose name contains its ID
 * in brackets, and an item may not tick more acceptance criteria than it has
 * tests to back them.
 *
 * It works because ROADMAP.md's acceptance criteria are written to BE test
 * names. See docs/LOOP.md §3.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
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

const testSources = walk(ROOT).map((f) => readFileSync(f, 'utf8'));
const allTestText = testSources.join('\n');

const roadmap = readFileSync(join(ROOT, 'ROADMAP.md'), 'utf8');

// ### [x] M1-04 — Title      /      ### [ ] M1-05 — Title
const itemRe = /^### \[([ x])\]\s+([A-Z]\d+-\d+)\s+—\s+(.+)$/gm;

const errors = [];
let done = 0;
let pending = 0;

let match;
while ((match = itemRe.exec(roadmap)) !== null) {
  const [, box, id, title] = match;

  // The item's body runs to the next heading or end of file.
  const start = match.index + match[0].length;
  const nextHeading = roadmap.slice(start).search(/^### \[[ x]\]/m);
  const body = nextHeading === -1 ? roadmap.slice(start) : roadmap.slice(start, start + nextHeading);

  const statusMatch = body.match(/^\*\*Status:\*\*\s*(\S+)/m);
  const status = statusMatch ? statusMatch[1] : box === 'x' ? 'done' : 'todo';

  if (status !== 'done') {
    pending++;
    if (box === 'x') {
      errors.push(`${id} — checkbox is ticked but status is "${status}". They must agree.`);
    }
    continue;
  }
  done++;

  if (box !== 'x') {
    errors.push(`${id} — status is "done" but the checkbox is not ticked. They must agree.`);
  }

  const tag = `[${id}]`;
  const testCount = allTestText.split(tag).length - 1;
  if (testCount === 0) {
    errors.push(
      `${id} "${title}" is marked done but no test name contains ${tag}. ` +
        `Either write the test or set the item back to todo.`,
    );
    continue;
  }

  // Acceptance criteria are "- [x] …" lines inside the item body.
  const ticked = (body.match(/^\s*- \[x\]/gm) ?? []).length;
  if (ticked > testCount) {
    errors.push(
      `${id} "${title}" ticks ${ticked} acceptance criteria but only ${testCount} test(s) ` +
        `carry ${tag}. Untick the ones you cannot prove.`,
    );
  }
}

if (errors.length > 0) {
  console.error('\ngate:roadmap FAILED\n');
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error('');
  process.exit(1);
}

console.log(`gate:roadmap ok — ${done} item(s) done and evidenced, ${pending} pending`);
