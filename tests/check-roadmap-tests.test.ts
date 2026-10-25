import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(__dirname, '..', 'scripts', 'check-roadmap-tests.mjs');
const ROADMAP_HEADER = '# Roadmap\n\n';

function itemBody(criteria: string): string {
  return `**Status:** done · **Size:** S · **Depends on:** none\n\n**Acceptance criteria:**\n- [x] ${criteria}\n\n**Touches:** none\n`;
}

/** Runs the gate against a throwaway fixture tree and returns its outcome. */
function runGate(roadmap: string, testFileContents: string): { status: number; output: string } {
  const root = mkdtempSync(join(tmpdir(), 'roadmap-gate-'));
  try {
    writeFileSync(join(root, 'ROADMAP.md'), roadmap);
    const testsDir = join(root, 'tests');
    mkdirSync(testsDir);
    writeFileSync(join(testsDir, 'fixture.test.ts'), testFileContents);

    try {
      const output = execFileSync('node', [SCRIPT], {
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

describe('gate:roadmap counts test names, not any mention', () => {
  it('[M0-13] an ID appearing only in a comment does not count as evidence', () => {
    const roadmap = `${ROADMAP_HEADER}### [x] M9-01 — Fixture item\n\n${itemBody('does the thing')}`;
    const testFile = `// this comment mentions [M9-01] but proves nothing\nit('does the thing', () => {});\n`;

    const { status, output } = runGate(roadmap, testFile);

    expect(status).toBe(1);
    expect(output).toContain('M9-01');
    expect(output).toContain('no test name contains [M9-01]');
  });

  it('[M0-13] an ID inside an it() or test() name does count', () => {
    const roadmap = `${ROADMAP_HEADER}### [x] M9-01 — Fixture item\n\n${itemBody('does the thing')}`;
    const testFile = `it('[M9-01] does the thing', () => {});\n`;

    const { status, output } = runGate(roadmap, testFile);

    expect(status).toBe(0);
    expect(output).toContain('gate:roadmap ok');
  });

  it('[M0-13] a string literal passed to an unrelated .test() call does not count as evidence', () => {
    const roadmap = `${ROADMAP_HEADER}### [x] M9-01 — Fixture item\n\n${itemBody('does the thing')}`;
    const testFile = `it('checks the pattern', () => {\n  expect(somePattern.test('[M9-01] not a jest test name')).toBe(false);\n});\n`;

    const { status, output } = runGate(roadmap, testFile);

    expect(status).toBe(1);
    expect(output).toContain('no test name contains [M9-01]');
  });

  it('[M0-13] the gate still passes on the repository as it stands', () => {
    const output = execFileSync('node', [SCRIPT], { encoding: 'utf8' });

    expect(output).toContain('gate:roadmap ok');
  });
});
