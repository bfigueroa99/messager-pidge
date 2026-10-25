#!/usr/bin/env node
/**
 * What should this firing do? `docs/LOOP.md` §0 and §2, as code.
 *
 *   node scripts/loop-next.mjs          # one line of decision + what needs a human
 *   node scripts/loop-next.mjs --json   # the same, as JSON
 *
 * Why it exists: on 2026-09-10 iteration 43 found zero `todo` items, read §9's
 * "stop when no todo items remain" literally, set `paused: true`, and the loop
 * never ran again — while docs/PRODUCT.md still described the Loft, the
 * Columbarium, the Atlas and Passage, none of which had a roadmap item. The
 * prose rule had no branch for "the roadmap ran dry", and nothing told a
 * person that the loop had stopped or why. This script has both: when nothing
 * is selectable it answers `plan` (docs/LOOP.md §11), and every answer carries
 * the list of things only a human can unblock.
 *
 * The decision is data, so the exit code is 0 whatever it says. CI status is
 * not visible from here; docs/LOOP.md §1's "CI is red" override still
 * outranks this.
 *
 * Environment (for tests): LOOP_ROOT points at another tree, LOOP_NOW fixes
 * the clock (ISO 8601).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROPOSAL_REVIEW_HOURS, parseQuestions, parseRoadmap, productHash } from './lib/roadmap.mjs';

const ROOT = process.env.LOOP_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const NOW = process.env.LOOP_NOW === undefined ? Date.now() : Date.parse(process.env.LOOP_NOW);

const HOUR_MS = 3_600_000;
// docs/LOOP.md §0's concurrency lease.
const LIVE_CLAIM_MS = 90 * 60_000;
// docs/LOOP.md §2's override table.
const HARDENING_EVERY = 5;
const AUDIT_EVERY = 10;
const MAX_CONSECUTIVE_FAILURES = 3;
// The budget ran out on 2026-09-15 and the only record of it was a date in
// state.json. Warn this far ahead, so a person hears before the loop stops.
const BUDGET_WARN_MS = 3 * 24 * HOUR_MS;
const BUDGET_WARN_ITERATIONS = 5;

const readText = (rel) => {
  const path = join(ROOT, rel);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
};

function decide({ state, items, questions, product, now }) {
  const needsHuman = [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const counts = {};
  for (const item of items) counts[item.status] = (counts[item.status] ?? 0) + 1;

  // ── Things only a person can change, reported on every firing ────────────
  if (state.paused === true) {
    needsHuman.push(
      '`paused` is true in .loop/state.json. Only a person sets or clears it; set it to false to let the loop run.',
    );
  }

  const budget = state.budget ?? {};
  const iteration = state.iteration ?? 0;
  const stopAfter = Date.parse(budget.stop_after ?? '');
  let budgetSpent = null;
  if (typeof budget.max_iterations === 'number' && iteration >= budget.max_iterations) {
    budgetSpent = `iteration ${iteration} has reached budget.max_iterations (${budget.max_iterations})`;
    needsHuman.push(`The budget is spent: ${budgetSpent}. Raise budget.max_iterations in .loop/state.json to continue.`);
  } else if (!Number.isNaN(stopAfter) && now > stopAfter) {
    const days = Math.floor((now - stopAfter) / (24 * HOUR_MS));
    budgetSpent = `budget.stop_after (${budget.stop_after}) passed ${days} day(s) ago`;
    needsHuman.push(`The budget is spent: ${budgetSpent}. Move it forward in .loop/state.json to continue.`);
  } else {
    if (!Number.isNaN(stopAfter) && stopAfter - now <= BUDGET_WARN_MS) {
      const hours = Math.round((stopAfter - now) / HOUR_MS);
      needsHuman.push(`The budget ends at ${budget.stop_after}, in about ${hours} hour(s). Move budget.stop_after forward if the loop should keep going.`);
    }
    if (typeof budget.max_iterations === 'number' && budget.max_iterations - iteration <= BUDGET_WARN_ITERATIONS) {
      needsHuman.push(`Only ${budget.max_iterations - iteration} iteration(s) left in the budget. Raise budget.max_iterations if the loop should keep going.`);
    }
  }

  const failures = state.consecutive_failures ?? 0;
  if (failures >= MAX_CONSECUTIVE_FAILURES) {
    needsHuman.push(
      `${failures} consecutive failed iterations. Read the last journal blocks, fix the cause, then reset consecutive_failures to 0.`,
    );
  }

  for (const item of items) {
    if (item.status !== 'blocked') continue;
    for (const q of item.blockedBy) {
      const question = questions.get(q);
      if (question === undefined) {
        // Otherwise the item is stuck for good: nobody can answer a question
        // that was never asked.
        needsHuman.push(`${item.id} (${item.title}) is blocked by ${q}, which docs/QUESTIONS.md does not contain. Ask it there, or unblock the item.`);
      } else if (question.state !== 'answered') {
        needsHuman.push(`${item.id} (${item.title}) waits on ${q}, still ${question.state} in docs/QUESTIONS.md: ${question.question}`);
      }
    }
  }

  const reviewMs = PROPOSAL_REVIEW_HOURS * HOUR_MS;
  const reviewEnds = (item) => Date.parse(item.proposedAt ?? '') + reviewMs;
  const underReview = items.filter((i) => i.status === 'proposed' && !(reviewEnds(i) <= now));
  if (underReview.length > 0) {
    const until = new Date(Math.max(...underReview.map(reviewEnds).filter(Number.isFinite), now)).toISOString();
    needsHuman.push(
      `${underReview.length} proposed item(s) (${underReview.map((i) => i.id).join(', ')}) are open for review until ${until}. ` +
        'In ROADMAP.md set **Status:** rejected to veto one, or todo to approve it now; after that the loop builds them.',
    );
  }

  const hash = product === null ? null : productHash(product);
  const productPlanned = hash !== null && state.plan_exhausted_for === hash;
  if (productPlanned) {
    needsHuman.push(
      'docs/PRODUCT.md has nothing left to plan (recorded for its current text). Extend the spec, or answer a blocking question, to give the loop work.',
    );
  }

  const answer = (action, reason, extra = {}) => ({ action, ...extra, reason, needs_human: needsHuman, counts });

  // ── docs/LOOP.md §0: stop conditions, in the order the protocol checks them ─
  if (state.paused === true) return answer('stop', 'paused is true');
  if (budgetSpent !== null) return answer('stop', `budget spent: ${budgetSpent}`);
  if (failures >= MAX_CONSECUTIVE_FAILURES) return answer('stop', `${failures} consecutive failures`);

  const holder = state.current_item ?? null;
  const claimedAt = Date.parse(state.claimed_at ?? '');
  if (holder !== null && !Number.isNaN(claimedAt) && now - claimedAt < LIVE_CLAIM_MS) {
    return answer('stop', `${holder} was claimed at ${state.claimed_at}; another iteration is live`);
  }
  const stolen = holder !== null ? { stale_claim: holder } : {};

  // ── docs/LOOP.md §2: overrides ───────────────────────────────────────────
  if (iteration - (state.last_hardening_iteration ?? 0) >= HARDENING_EVERY) {
    return answer('hardening', `iteration ${iteration} - last_hardening_iteration ${state.last_hardening_iteration} >= ${HARDENING_EVERY}`, stolen);
  }
  if (iteration - (state.last_audit_iteration ?? 0) >= AUDIT_EVERY) {
    return answer('audit', `iteration ${iteration} - last_audit_iteration ${state.last_audit_iteration} >= ${AUDIT_EVERY}`, stolen);
  }

  // ── docs/LOOP.md §2: the topmost workable item ───────────────────────────
  // Besides `todo`: an item a dead iteration left `in-progress`, a `blocked`
  // item whose questions have all been answered (QUESTIONS.md promises "the
  // next iteration picks it up"), and a proposal whose review window passed.
  const via = (item) => {
    if (item.status === 'todo') return 'todo';
    if (item.status === 'in-progress') return 'resume';
    if (item.status === 'blocked' && item.blockedBy.length > 0 && !item.blockedBy.some((q) => questions.get(q)?.state !== 'answered')) {
      return 'unblock';
    }
    if (item.status === 'proposed' && reviewEnds(item) <= now) return 'promote';
    return null;
  };
  const depsDone = (item) => item.dependsOn.every((d) => byId.get(d)?.status === 'done');

  for (const item of items) {
    const how = via(item);
    if (how === null || !depsDone(item)) continue;
    if (item.size === 'L') {
      return answer('split', `${item.id} is size L; split it into 2–4 S/M items`, { item: item.id, via: how, ...stolen });
    }
    return answer('item', `${item.id} is the topmost workable item (${how})`, { item: item.id, via: how, ...stolen });
  }

  // ── Nothing is workable ──────────────────────────────────────────────────
  if (underReview.length > 0) {
    return answer('wait', 'every remaining item is a proposal still inside its review window');
  }
  if (productPlanned) {
    return answer('stop', 'nothing is workable and docs/PRODUCT.md has nothing left to plan');
  }
  const waiting = items.filter((i) => via(i) !== null).map((i) => i.id);
  return answer(
    'plan',
    waiting.length > 0
      ? `nothing is workable: ${waiting.join(', ')} wait on dependencies that are not done`
      : 'nothing is workable: no item is todo',
    { product_hash: hash },
  );
}

const stateText = readText('.loop/state.json');
const roadmapText = readText('ROADMAP.md');
if (stateText === null || roadmapText === null) {
  console.error(`loop-next: cannot read .loop/state.json or ROADMAP.md under ${ROOT}`);
  process.exit(2);
}

const decision = decide({
  state: JSON.parse(stateText),
  items: parseRoadmap(roadmapText),
  questions: parseQuestions(readText('docs/QUESTIONS.md') ?? ''),
  product: readText('docs/PRODUCT.md'),
  now: NOW,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(decision, null, 2));
} else {
  console.log(`loop-next: ${decision.action}${decision.item ? ` ${decision.item}` : ''} — ${decision.reason}`);
  if (decision.needs_human.length > 0) {
    console.log('\nneeds a human:');
    for (const line of decision.needs_human) console.log(`  - ${line}`);
  }
}
