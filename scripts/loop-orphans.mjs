#!/usr/bin/env node
/**
 * Find loop iterations that landed on the wrong branch.
 *
 *   node scripts/loop-orphans.mjs          # one line per orphan
 *   node scripts/loop-orphans.mjs --json
 *
 * Why it exists: on 2026-09-08 a fired session was told by its harness to
 * develop on `claude/tender-thompson-jralin` instead of the loop's branch. It
 * claimed and finished M1-22 there, verify green, and opened PR #2 against
 * `main`. Nothing on the loop's branch could see that work, so twelve hours
 * later the next firing selected M1-22 again and built it a second time.
 * PR #2 was still open, a draft, six weeks later.
 *
 * An orphan is a remote branch that holds commits the integration branch does
 * not, at least one of which is an iteration's claim commit (`<ID>: claim`,
 * `HARDENING: claim …`). The claim commit is the discriminator on purpose: a
 * branch a person or a review session pushed has no claim commit, so it is
 * never mistaken for loop work and never adopted without review.
 *
 *   adoptable   — the integration branch is an ancestor and the orphan's own
 *                 state.json has no claim open: a finished iteration, which
 *                 a fast-forward lands after `pnpm run verify` passes on it.
 *   unfinished  — the integration branch is an ancestor, but the orphan
 *                 still holds a claim: the session died mid-item, or is
 *                 still working. Never adopted; a stale claim's item is
 *                 simply built again from the loop's branch.
 *   superseded  — diverged, and every item it touched is already done or
 *                 split on the integration branch. Safe to delete.
 *   diverged    — diverged, with work the integration branch lacks. A person
 *                 (or a careful iteration) reconciles it.
 *
 * Environment (for tests): LOOP_ROOT points at another checkout.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOOP_BRANCH, parseRoadmap } from './lib/roadmap.mjs';

const ROOT = process.env.LOOP_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) =>
  execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const CLAIM_RE = /^(?:[A-Z]\d+-\d+|HARDEN(?:ING)?|AUDIT|PLAN): claim\b/;
const ITEM_SUBJECT_RE = /^([A-Z]\d+-\d+):/;

// Not read from the working tree's state.json: that is the field a stray
// iteration rewrites, and the adoption flow checks the orphan's tree out.
const integration = process.env.LOOP_BRANCH ?? LOOP_BRANCH;
const base = `origin/${integration}`;
const settled = new Map(
  parseRoadmap(git('show', `${base}:ROADMAP.md`)).map((i) => [i.id, i.status === 'done' || i.status === 'split']),
);

function classify(ref, behind, touched) {
  if (behind > 0) {
    return touched.length > 0 && touched.every((id) => settled.get(id) === true) ? 'superseded' : 'diverged';
  }
  let holder;
  try {
    holder = JSON.parse(git('show', `${ref}:.loop/state.json`)).current_item ?? null;
  } catch {
    holder = 'unreadable';
  }
  return holder === null ? 'adoptable' : 'unfinished';
}

const orphans = [];
for (const line of git('for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin').split('\n')) {
  const ref = line.trim();
  if (ref === '' || ref === base || ref === 'origin/HEAD' || ref === 'origin') continue;

  const [behind, ahead] = git('rev-list', '--left-right', '--count', `${base}...${ref}`).split(/\s+/).map(Number);
  if (!(ahead > 0)) continue;

  const subjects = git('log', '--format=%s', `${base}..${ref}`).split('\n');
  if (!subjects.some((s) => CLAIM_RE.test(s))) continue;

  const touched = [...new Set(subjects.map((s) => s.match(ITEM_SUBJECT_RE)?.[1]).filter(Boolean))];
  orphans.push({
    branch: ref.replace(/^origin\//, ''),
    kind: classify(ref, behind, touched),
    ahead,
    behind,
    items: touched,
    tip: git('rev-parse', ref),
  });
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ integration, orphans }, null, 2));
} else if (orphans.length === 0) {
  console.log(`loop-orphans: none — no remote branch holds an iteration that ${integration} lacks`);
} else {
  for (const o of orphans) {
    const what = o.items.length > 0 ? o.items.join(', ') : 'no item ID';
    console.log(`loop-orphans: ${o.kind} ${o.branch} (${o.ahead} ahead, ${o.behind} behind; ${what})`);
  }
}
