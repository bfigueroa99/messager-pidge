import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * `scripts/loop-next.mjs` is docs/LOOP.md §0 and §2 as code. Every fixture
 * here is a throwaway tree, and the clock is fixed with LOOP_NOW, so each
 * case is a frozen moment in the loop's life — several of them real ones.
 */

const SCRIPTS = join(__dirname, '..', 'scripts');

interface Decision {
  action: string;
  item?: string;
  via?: string;
  reason: string;
  needs_human: string[];
  product_hash?: string;
  stale_claim?: string;
}

const PRODUCT = '# Loft\n\n## 3. Non-negotiable invariants\n\n## 7. The mechanics we add\n\n## 8. Explicit non-goals\n';

const QUESTIONS_OPEN =
  '# Questions\n\n## Q-002 — [open] — iteration 0 — item M1-08\n\n**Question:** Which Supabase project should the loop deploy to?\n\n**Answer:**\n';
const QUESTIONS_ANSWERED = QUESTIONS_OPEN.replace('[open]', '[answered]').replace('**Answer:**', '**Answer:** this one.');

/** The state iteration 43 found on 2026-09-10, before it paused the loop. */
function state(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    paused: false,
    iteration: 43,
    current_item: null,
    claimed_at: null,
    claimed_by: null,
    consecutive_failures: 0,
    last_hardening_iteration: 40,
    last_audit_iteration: 41,
    test_count_floor: 0,
    branch: 'claude/app-development-loop-szg7yj',
    budget: { max_iterations: 60, stop_after: '2026-09-15T00:00:00Z' },
    ...overrides,
  };
}

function item(id: string, status: string, extra = '', size = 'S', title = 'Fixture item'): string {
  const box = status === 'done' ? 'x' : ' ';
  return `### [${box}] ${id} — ${title}\n\n**Status:** ${status} · **Size:** ${size}${extra}\n\n---\n\n`;
}

/** ROADMAP.md as iteration 43 saw it: everything done or split, one item blocked. */
const DRY_ROADMAP =
  '# Roadmap\n\n' +
  item('M1-08', 'split', ' · **Depends on:** M1-07', 'L') +
  item('M1-07', 'done', ' · **Depends on:** none') +
  item('M1-09', 'done', ' · **Depends on:** M1-07') +
  item('M1-11', 'blocked', ' · **Depends on:** M1-07 · **Blocked by:** Q-002', 'M', 'Wire a real Supabase client');

interface Tree {
  state?: Record<string, unknown>;
  roadmap?: string;
  questions?: string;
  product?: string;
}

function makeTree(tree: Tree): string {
  const root = mkdtempSync(join(tmpdir(), 'loop-next-'));
  mkdirSync(join(root, '.loop'));
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, '.loop', 'state.json'), JSON.stringify(tree.state ?? state()));
  writeFileSync(join(root, 'ROADMAP.md'), tree.roadmap ?? DRY_ROADMAP);
  writeFileSync(join(root, 'docs', 'QUESTIONS.md'), tree.questions ?? QUESTIONS_OPEN);
  writeFileSync(join(root, 'docs', 'PRODUCT.md'), tree.product ?? PRODUCT);
  return root;
}

function next(tree: Tree, now: string): Decision {
  const root = makeTree(tree);
  try {
    const out = execFileSync('node', [join(SCRIPTS, 'loop-next.mjs'), '--json'], {
      env: { ...process.env, LOOP_ROOT: root, LOOP_NOW: now },
      encoding: 'utf8',
    });
    return JSON.parse(out) as Decision;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function gate(roadmap: string, product: string | null = PRODUCT): { status: number; output: string } {
  const root = mkdtempSync(join(tmpdir(), 'loop-gate-'));
  try {
    writeFileSync(join(root, 'ROADMAP.md'), roadmap);
    mkdirSync(join(root, 'tests'));
    writeFileSync(join(root, 'tests', 'fixture.test.ts'), "it('[M9-01] fixture', () => {});\n");
    if (product !== null) {
      mkdirSync(join(root, 'docs'));
      writeFileSync(join(root, 'docs', 'PRODUCT.md'), product);
    }
    try {
      const output = execFileSync('node', [join(SCRIPTS, 'check-roadmap-tests.mjs')], {
        env: { ...process.env, ROADMAP_GATE_ROOT: root },
        encoding: 'utf8',
      });
      return { status: 0, output };
    } catch (err) {
      const e = err as { status: number; stdout: string; stderr: string };
      return { status: e.status, output: `${e.stdout}${e.stderr}` };
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const proposal = (id: string, proposedAt: string, title = 'The Columbarium: every bird you have lost', dep = 'M1-09'): string =>
  `### [ ] ${id} — ${title}\n\n**Status:** proposed · **Size:** M · **Depends on:** ${dep} · **Proposed:** ${proposedAt}\n**From:** docs/PRODUCT.md §7 (The Columbarium)\n\n---\n\n`;

describe('loop-next: the roadmap running dry is a planning step, not a stop', () => {
  it('[M0-16] the state that paused the loop on 2026-09-10 now answers plan', () => {
    const d = next({}, '2026-09-10T12:12:00Z');

    expect(d.action).toBe('plan');
    expect(d.product_hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('[M0-16] the topmost todo whose dependencies are done is selected, skipping one behind a blocked item', () => {
    const roadmap =
      DRY_ROADMAP +
      item('M2-01', 'todo', ' · **Depends on:** M1-11') +
      item('M2-02', 'todo', ' · **Depends on:** M1-09');

    const d = next({ roadmap }, '2026-09-10T12:12:00Z');

    expect(d.action).toBe('item');
    expect(d.item).toBe('M2-02');
    expect(d.via).toBe('todo');
  });

  it('[M0-16] a size-L item is split before anything is built', () => {
    const d = next({ roadmap: DRY_ROADMAP + item('M2-01', 'todo', ' · **Depends on:** none', 'L') }, '2026-09-10T12:12:00Z');

    expect(d.action).toBe('split');
    expect(d.item).toBe('M2-01');
  });

  it('[M0-16] hardening and audit fire on schedule, hardening first', () => {
    const both = next({ state: state({ iteration: 50, last_hardening_iteration: 40, last_audit_iteration: 40 }) }, '2026-09-10T12:12:00Z');
    const audit = next({ state: state({ iteration: 51, last_hardening_iteration: 50, last_audit_iteration: 41 }) }, '2026-09-10T12:12:00Z');

    expect(both.action).toBe('hardening');
    expect(audit.action).toBe('audit');
  });

  it('[M0-16] a live claim stops the firing, and a stale one is resumed rather than skipped forever', () => {
    const roadmap = DRY_ROADMAP + item('M2-01', 'in-progress', ' · **Depends on:** none');
    const claimed = { current_item: 'M2-01', claimed_at: '2026-09-10T12:00:00Z' };

    const live = next({ roadmap, state: state(claimed) }, '2026-09-10T12:30:00Z');
    const stale = next({ roadmap, state: state(claimed) }, '2026-09-10T14:00:00Z');

    expect(live.action).toBe('stop');
    expect(stale.action).toBe('item');
    expect(stale.item).toBe('M2-01');
    expect(stale.via).toBe('resume');
    expect(stale.stale_claim).toBe('M2-01');
  });

  it('[M0-16] a proposal waits out its review window, then is built', () => {
    const roadmap = DRY_ROADMAP + proposal('M2-01', '2026-09-10T12:30:00Z');

    const during = next({ roadmap }, '2026-09-11T00:12:00Z');
    const after = next({ roadmap }, '2026-09-11T12:31:00Z');

    expect(during.action).toBe('wait');
    expect(during.needs_human.join('\n')).toContain('M2-01');
    expect(after.action).toBe('item');
    expect(after.item).toBe('M2-01');
    expect(after.via).toBe('promote');
  });

  it('[M0-16] a rejected proposal is never built and never counts as work', () => {
    const roadmap = DRY_ROADMAP + proposal('M2-01', '2026-09-01T00:00:00Z').replace('**Status:** proposed', '**Status:** rejected');

    expect(next({ roadmap }, '2026-09-10T12:12:00Z').action).toBe('plan');
  });

  it('[M0-16] once PRODUCT.md is recorded as fully planned the loop stops instead of re-planning, until the spec changes', () => {
    const hash = next({}, '2026-09-10T12:12:00Z').product_hash;

    const planned = next({ state: state({ plan_exhausted_for: hash }) }, '2026-09-10T12:12:00Z');
    const specChanged = next(
      { state: state({ plan_exhausted_for: hash }), product: `${PRODUCT}\n## 10. Something new\n` },
      '2026-09-10T12:12:00Z',
    );

    expect(planned.action).toBe('stop');
    expect(planned.needs_human.join('\n')).toContain('nothing left to plan');
    expect(specChanged.action).toBe('plan');
  });

  it('[M0-16] gate:roadmap accepts a proposal that cites docs/PRODUCT.md and dates itself', () => {
    const roadmap = `# Roadmap\n\n${item('M9-01', 'done', ' · **Depends on:** none')}${proposal('M2-01', '2026-10-25T00:00:00Z', undefined, 'M9-01')}`;

    const { status, output } = gate(roadmap);

    expect(output).toContain('gate:roadmap ok');
    expect(status).toBe(0);
  });

  it('[M0-16] gate:roadmap rejects a proposal with no PRODUCT.md citation, no date, or a citation to a missing section', () => {
    const uncited = gate(`# Roadmap\n\n${proposal('M2-01', '2026-10-25T00:00:00Z').replace(/\*\*From:\*\*.*\n/, '')}`);
    const undated = gate(`# Roadmap\n\n${proposal('M2-01', '2026-10-25T00:00:00Z').replace(/ · \*\*Proposed:\*\* \S+/, '')}`);
    const nowhere = gate(`# Roadmap\n\n${proposal('M2-01', '2026-10-25T00:00:00Z').replace('§7', '§12')}`);

    expect(uncited.status).toBe(1);
    expect(uncited.output).toContain('no **From:** docs/PRODUCT.md');
    expect(undated.status).toBe(1);
    expect(undated.output).toContain('no **Proposed:** date');
    expect(nowhere.status).toBe(1);
    expect(nowhere.output).toContain('§12, which does not exist');
  });

  it('[M0-16] gate:roadmap rejects a proposal named after a PRODUCT.md non-goal', () => {
    const streak = gate(`# Roadmap\n\n${proposal('M2-01', '2026-10-25T00:00:00Z', 'A daily streak for regular senders')}`);
    const undo = gate(`# Roadmap\n\n${proposal('M2-01', '2026-10-25T00:00:00Z', 'Undo a release within ten seconds')}`);
    const express = gate(`# Roadmap\n\n${proposal('M2-01', '2026-10-25T00:00:00Z', 'Express birds for urgent notes')}`);

    for (const { status, output } of [streak, undo, express]) {
      expect(status).toBe(1);
      expect(output).toContain('non-goal');
    }
  });

  it('[M0-16] gate:roadmap rejects an open item that depends on a split parent or on an unknown ID', () => {
    const roadmap = `# Roadmap\n\n${item('M1-08', 'split', '', 'L')}${item('M2-01', 'todo', ' · **Depends on:** M1-08')}${item('M2-02', 'todo', ' · **Depends on:** M7-77')}`;

    const { status, output } = gate(roadmap);

    expect(status).toBe(1);
    expect(output).toContain('M2-01 depends on M1-08, which was split');
    expect(output).toContain('M2-02 depends on M7-77, which is not in ROADMAP.md');
  });
});

describe('loop-next: every answer says what only a human can unblock', () => {
  it('[M0-17] a blocked item is reported with its open question, every firing', () => {
    const d = next({}, '2026-09-10T12:12:00Z');

    expect(d.needs_human.join('\n')).toContain('M1-11');
    expect(d.needs_human.join('\n')).toContain('Q-002');
    expect(d.needs_human.join('\n')).toContain('Which Supabase project');
  });

  it('[M0-17] a blocked item whose question was answered is picked up on the next firing', () => {
    const d = next({ questions: QUESTIONS_ANSWERED }, '2026-09-10T12:12:00Z');

    expect(d.action).toBe('item');
    expect(d.item).toBe('M1-11');
    expect(d.via).toBe('unblock');
    expect(d.needs_human.join('\n')).not.toContain('Q-002');
  });

  it('[M0-17] a blocked item naming a question that was never asked is reported, not silently stuck', () => {
    const d = next({ questions: '# Questions\n' }, '2026-09-10T12:12:00Z');

    expect(d.action).toBe('plan');
    expect(d.needs_human.join('\n')).toContain('M1-11 (Wire a real Supabase client) is blocked by Q-002, which docs/QUESTIONS.md does not contain');
  });

  it('[M0-17] a spent budget stops the loop and says which field to move', () => {
    const d = next({}, '2026-10-25T02:00:00Z');

    expect(d.action).toBe('stop');
    expect(d.reason).toContain('budget');
    expect(d.needs_human.join('\n')).toContain('budget.stop_after');
  });

  it('[M0-17] the budget warns days before it runs out, without stopping', () => {
    const byDate = next({}, '2026-09-13T00:12:00Z');
    const byCount = next({ state: state({ iteration: 57, last_hardening_iteration: 55, last_audit_iteration: 51 }) }, '2026-09-01T00:12:00Z');

    expect(byDate.action).toBe('plan');
    expect(byDate.needs_human.join('\n')).toContain('The budget ends at 2026-09-15T00:00:00Z');
    expect(byCount.action).toBe('plan');
    expect(byCount.needs_human.join('\n')).toContain('3 iteration(s) left');
  });

  it('[M0-17] paused stops the loop and is reported as the switch only a person flips', () => {
    const d = next({ state: state({ paused: true }) }, '2026-09-10T12:12:00Z');

    expect(d.action).toBe('stop');
    expect(d.needs_human.join('\n')).toContain('Only a person sets or clears it');
  });

  it('[M0-17] three consecutive failures stop the loop and ask for a person', () => {
    const d = next({ state: state({ consecutive_failures: 3 }) }, '2026-09-10T12:12:00Z');

    expect(d.action).toBe('stop');
    expect(d.needs_human.join('\n')).toContain('3 consecutive failed iterations');
  });

  it('[M0-17] the repository as it stands gets a decision and a non-empty list for a person', () => {
    const out = execFileSync('node', [join(SCRIPTS, 'loop-next.mjs'), '--json'], { encoding: 'utf8' });
    const d = JSON.parse(out) as Decision;

    expect(['stop', 'wait', 'hardening', 'audit', 'split', 'item', 'plan']).toContain(d.action);
    expect(Array.isArray(d.needs_human)).toBe(true);
  });
});
