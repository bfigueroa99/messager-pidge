/**
 * One parser for the loop's durable files, shared by `scripts/loop-next.mjs`,
 * `scripts/loop-orphans.mjs` and `gate:roadmap`.
 *
 * Until M0-16 every iteration re-derived "what do I do now?" by reading the
 * whole of ROADMAP.md (1,600+ lines by iteration 43) and QUESTIONS.md by eye.
 * That is how the loop paused itself for good on 2026-09-10: the prose rule
 * had no answer for "nothing is todo", so the iteration improvised one. These
 * functions turn the files into data so the rule can be code, and tested.
 */
import { createHash } from 'node:crypto';

/** Every status an item may carry. Anything else is a typo the gate rejects. */
export const STATUSES = Object.freeze([
  'todo',
  'in-progress',
  'blocked',
  'done',
  'split',
  // Written only by a PLAN iteration (docs/LOOP.md §11): drawn from
  // docs/PRODUCT.md, and not built until a human has had a window to veto it.
  'proposed',
  // A human's veto of a proposal. Kept, never deleted, so PLAN never
  // re-proposes it.
  'rejected',
]);

/** How long a proposal waits for a human veto before the loop may build it. */
export const PROPOSAL_REVIEW_HOURS = 24;

/**
 * The loop's integration branch. A constant, not read from
 * `.loop/state.json`, because state.json is exactly what a stray iteration
 * rewrites: on 2026-09-08 one set `branch` to its own session branch.
 * `tests/repo-contract.test.ts` pins state.json, docs/LOOP.md and
 * .claude/loop.md to this value.
 */
export const LOOP_BRANCH = 'claude/app-development-loop-szg7yj';

// A full ISO 8601 timestamp with a zone. A bare date, or a time with no zone,
// would silently move a proposal's review window by up to a day.
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Epoch ms of a zoned ISO 8601 timestamp, or NaN for anything looser. */
export function timestampMs(text) {
  return typeof text === 'string' && TIMESTAMP_RE.test(text) ? Date.parse(text) : Number.NaN;
}

// ### [x] M1-04 — Title      /      ### [ ] M1-05 — Title
// Same shape gate:roadmap has always matched, so the two never disagree on
// what counts as an item.
const ITEM_RE = /^### \[([ x])\]\s+([A-Z]\d+-\d+)\s+—\s+(.+)$/gm;
const NEXT_ITEM_RE = /^### \[[ x]\]/m;
const ID_RE = /[A-Z]\d+-\d+/g;
const QUESTION_ID_RE = /Q-\d+/g;

/**
 * `status` is the raw word after `**Status:**`, case and all, so a typo such
 * as `Blocked` reaches validateRoadmap() as an unknown status instead of
 * quietly falling back to the checkbox and being built as a `todo`.
 *
 * @returns {Array<{id: string, box: ' ' | 'x', title: string, status: string,
 *   size: string | null, dependsOn: string[], blockedBy: string[],
 *   proposed: string | null, proposedAtMs: number, from: string | null,
 *   body: string, line: number}>}
 */
export function parseRoadmap(text) {
  const items = [];
  let match;
  ITEM_RE.lastIndex = 0;
  while ((match = ITEM_RE.exec(text)) !== null) {
    const [, box, id, title] = match;
    const start = match.index + match[0].length;
    const rest = text.slice(start);
    const next = rest.search(NEXT_ITEM_RE);
    const body = next === -1 ? rest : rest.slice(0, next);

    const status = body.match(/^\*\*Status:\*\*\s*(\S+)/m)?.[1] ?? (box === 'x' ? 'done' : 'todo');
    const size = body.match(/\*\*Size:\*\*\s*([SML])\b/)?.[1] ?? null;
    const dependsLine = body.match(/\*\*Depends on:\*\*\s*([^\n·]*)/)?.[1] ?? '';
    const blockedLine = body.match(/\*\*Blocked by:\*\*\s*([^\n·]*)/)?.[1] ?? '';
    const proposed = body.match(/\*\*Proposed:\*\*\s*(\S+)/)?.[1] ?? null;
    const from = body.match(/^\*\*From:\*\*\s*(.+)$/m)?.[1]?.trim() ?? null;

    items.push({
      id,
      box,
      title: title.trim(),
      status,
      size,
      dependsOn: dependsLine.match(ID_RE) ?? [],
      blockedBy: blockedLine.match(QUESTION_ID_RE) ?? [],
      proposed,
      proposedAtMs: timestampMs(proposed),
      from,
      body,
      line: text.slice(0, match.index).split('\n').length,
    });
  }
  return items;
}

/**
 * `## Q-002 — [open] — iteration 0 — item M1-08` → `{ id, state, question }`.
 * `state` is lowercased and anything after its first word is dropped, so a
 * person who writes `[Answered]` or `[answered 2026-10-26]` is still heard.
 * @returns {Map<string, {id: string, state: string, question: string}>}
 */
export function parseQuestions(text) {
  const questions = new Map();
  const headRe = /^## (Q-\d+)\s+—\s+\[\s*([A-Za-z]+)[^\]\n]*\]/gm;
  let match;
  while ((match = headRe.exec(text)) !== null) {
    const [, id, rawState] = match;
    const state = rawState.toLowerCase();
    const rest = text.slice(match.index + match[0].length);
    const next = rest.search(/^## Q-\d+/m);
    const body = next === -1 ? rest : rest.slice(0, next);
    const question = body.match(/\*\*Question:\*\*\s*([\s\S]*?)(?:\n\s*\n|$)/)?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
    questions.set(id, { id, state, question });
  }
  return questions;
}

/** `## 7. The mechanics we add` → `'7'`. What a `**From:**` line may cite. */
export function productSections(text) {
  return new Set([...text.matchAll(/^## (\d+)\.\s/gm)].map((m) => m[1]));
}

/** The fingerprint PLAN records when PRODUCT.md has nothing left to plan. */
export function productHash(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

// docs/PRODUCT.md §8 and CLAUDE.md name the things an autonomous agent drifts
// toward. A proposal is the one place the loop writes product scope on its
// own, so a title naming one of them is refused outright. It is a tripwire on
// titles, not a reading of intent: an item can still drift with an innocent
// title, which is what the AUDIT iteration's drift check is for.
const NON_GOAL_RE =
  /\b(streaks?|undo|unsend|recall|resurrect\w*|fast[- ]path|speed[- ]?ups?|boosts?|express|pay[- ]to[- ]skip|priority send|leaderboards?|daily (?:quests?|rewards?)|gacha|rarit(?:y|ies)|breeding|typing indicators?|read receipts?|reactions?)\b/i;

const OPEN_STATUSES = new Set(['todo', 'in-progress', 'blocked', 'proposed']);

/**
 * Structural rules the selection logic relies on. Returns error strings;
 * gate:roadmap prints them and fails.
 *
 * @param items parseRoadmap() output
 * @param product the text of docs/PRODUCT.md, or null if it does not exist
 */
export function validateRoadmap(items, product) {
  const errors = [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const sections = product === null ? null : productSections(product);

  for (const item of items) {
    if (!STATUSES.includes(item.status)) {
      errors.push(`${item.id} — unknown status "${item.status}". Use one of: ${STATUSES.join(', ')}.`);
      continue;
    }
    if (!OPEN_STATUSES.has(item.status)) continue;

    // A dependency on a split parent can never become "done", so an item
    // that names one is never selected and the loop believes it has run dry.
    for (const dep of item.dependsOn) {
      const target = byId.get(dep);
      if (target === undefined) {
        errors.push(`${item.id} depends on ${dep}, which is not in ROADMAP.md.`);
      } else if (target.status === 'split') {
        errors.push(`${item.id} depends on ${dep}, which was split. Point it at the child that finishes the work.`);
      } else if (target.status === 'rejected') {
        errors.push(`${item.id} depends on ${dep}, which was rejected. Reject ${item.id} too, or drop the dependency.`);
      }
    }

    if (item.status === 'blocked' && item.blockedBy.length === 0) {
      errors.push(`${item.id} is blocked but names no question. Add **Blocked by:** Q-NNN.`);
    }

    if (item.status === 'proposed') {
      if (Number.isNaN(item.proposedAtMs)) {
        errors.push(
          `${item.id} is proposed but has no usable **Proposed:** timestamp (ISO 8601 with a zone, e.g. 2026-10-25T12:00:00Z), so its review window never opens.`,
        );
      }
      const cited = item.from?.match(/docs\/PRODUCT\.md\s+§(\d+)/)?.[1];
      if (cited === undefined) {
        errors.push(`${item.id} is proposed but has no **From:** docs/PRODUCT.md §N line. Proposals come from the spec, never from nowhere.`);
      } else if (sections === null) {
        errors.push(`${item.id} cites docs/PRODUCT.md, which does not exist.`);
      } else if (!sections.has(cited)) {
        errors.push(`${item.id} cites docs/PRODUCT.md §${cited}, which does not exist.`);
      }
    }

    if (item.status === 'todo' || item.status === 'proposed') {
      const hit = item.title.match(NON_GOAL_RE);
      if (hit !== null) {
        errors.push(`${item.id} "${item.title}" names "${hit[0]}", a docs/PRODUCT.md §8 non-goal.`);
      }
    }
  }
  return errors;
}
