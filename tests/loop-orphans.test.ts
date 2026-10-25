import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * `scripts/loop-orphans.mjs` against a real git origin in a temp directory,
 * replaying what happened on 2026-09-08: an iteration claimed and finished an
 * item on a session branch (`claude/tender-thompson-jralin`) while the loop's
 * branch stood still, and the next firing built the same item again.
 */

const SCRIPT = join(__dirname, '..', 'scripts', 'loop-orphans.mjs');
const LOOP_BRANCH = 'claude/app-development-loop-szg7yj';

interface Orphan {
  branch: string;
  kind: 'adoptable' | 'superseded' | 'diverged';
  ahead: number;
  behind: number;
  items: string[];
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=loop', '-c', 'user.email=loop@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', '-C', cwd, ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

const roadmap = (m901: string): string =>
  `# Roadmap\n\n### [${m901 === 'done' ? 'x' : ' '}] M9-01 — Fixture item\n\n**Status:** ${m901} · **Size:** S · **Depends on:** none\n`;

/** A bare origin plus a clone whose loop branch holds M9-01 as todo. */
function setup(): { root: string; work: string } {
  const root = mkdtempSync(join(tmpdir(), 'loop-orphans-'));
  const origin = join(root, 'origin.git');
  const work = join(root, 'work');
  git(root, 'init', '--bare', '-q', origin);
  git(root, 'clone', '-q', origin, work);
  git(work, 'checkout', '-q', '-b', LOOP_BRANCH);
  mkdirSync(join(work, '.loop'));
  writeFileSync(join(work, '.loop', 'state.json'), JSON.stringify({ branch: LOOP_BRANCH }));
  writeFileSync(join(work, 'ROADMAP.md'), roadmap('todo'));
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'M0-01: bootstrap');
  git(work, 'push', '-q', 'origin', LOOP_BRANCH);
  return { root, work };
}

/** An iteration that claims M9-01 and lands it, on `branch`. */
function iterationOn(work: string, branch: string): void {
  git(work, 'checkout', '-q', '-b', branch, `origin/${LOOP_BRANCH}`);
  writeFileSync(join(work, 'ROADMAP.md'), roadmap('in-progress'));
  git(work, 'commit', '-q', '-am', 'M9-01: claim');
  writeFileSync(join(work, 'ROADMAP.md'), roadmap('done'));
  git(work, 'commit', '-q', '-am', 'M9-01: the fixture item');
  git(work, 'push', '-q', 'origin', branch);
  git(work, 'checkout', '-q', LOOP_BRANCH);
}

function orphans(work: string): Orphan[] {
  git(work, 'fetch', '-q', 'origin');
  const out = execFileSync('node', [SCRIPT, '--json'], { env: { ...process.env, LOOP_ROOT: work }, encoding: 'utf8' });
  return (JSON.parse(out) as { orphans: Orphan[] }).orphans;
}

describe('loop-orphans: an iteration that landed on the wrong branch is found', () => {
  it('[M0-18] an iteration pushed to a session branch is adoptable while the loop branch has not moved', () => {
    const { root, work } = setup();
    try {
      iterationOn(work, 'claude/tender-thompson-jralin');

      const found = orphans(work);

      expect(found).toEqual([
        expect.objectContaining({ branch: 'claude/tender-thompson-jralin', kind: 'adoptable', ahead: 2, behind: 0, items: ['M9-01'] }),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('[M0-18] once the loop branch has built the same item itself, the orphan is reported as superseded', () => {
    const { root, work } = setup();
    try {
      iterationOn(work, 'claude/tender-thompson-jralin');
      // Twelve hours later the next firing, blind to the orphan, builds M9-01 again.
      writeFileSync(join(work, 'ROADMAP.md'), roadmap('done'));
      git(work, 'commit', '-q', '-am', 'M9-01: the fixture item, again');
      git(work, 'push', '-q', 'origin', LOOP_BRANCH);

      expect(orphans(work)).toEqual([expect.objectContaining({ kind: 'superseded', behind: 1 })]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('[M0-18] a diverged orphan holding work the loop branch lacks is reported as diverged, not superseded', () => {
    const { root, work } = setup();
    try {
      iterationOn(work, 'claude/tender-thompson-jralin');
      writeFileSync(join(work, 'NOTES.md'), 'unrelated\n');
      git(work, 'add', 'NOTES.md');
      git(work, 'commit', '-q', '-m', 'HARDEN: an unrelated pass');
      git(work, 'push', '-q', 'origin', LOOP_BRANCH);

      expect(orphans(work)).toEqual([expect.objectContaining({ kind: 'diverged', items: ['M9-01'] })]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('[M0-18] a branch with no claim commit is never treated as loop work, so review branches are never adopted', () => {
    const { root, work } = setup();
    try {
      git(work, 'checkout', '-q', '-b', 'ccr-review', `origin/${LOOP_BRANCH}`);
      writeFileSync(join(work, 'ROADMAP.md'), roadmap('done'));
      git(work, 'commit', '-q', '-am', 'M9-01: done without a claim, by a person');
      git(work, 'push', '-q', 'origin', 'ccr-review');
      git(work, 'checkout', '-q', LOOP_BRANCH);

      expect(orphans(work)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
