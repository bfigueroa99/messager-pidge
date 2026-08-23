import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const SHOT_PNG = join(ROOT, 'artifacts', 'shots', 'index.png');

/**
 * This container has no simulator (`CLAUDE.md`), so a headless browser
 * screenshot is the only way any agent ever sees the UI. These tests exercise
 * the real CLI commands rather than internals, the same shape as
 * `tests/web-export.test.ts`, since the thing that must actually work is the
 * command line an agent types.
 */
describe('the app can be seen headlessly', () => {
  it(
    '[M0-08] `pnpm run shot -- index` writes a non-empty PNG in under 120 seconds',
    () => {
      rmSync(SHOT_PNG, { force: true });

      const start = Date.now();
      execFileSync('pnpm', ['run', 'shot', '--', 'index'], {
        cwd: ROOT,
        stdio: 'pipe',
        env: { ...process.env, CI: '1' },
      });
      const elapsedMs = Date.now() - start;

      expect(existsSync(SHOT_PNG)).toBe(true);
      expect(statSync(SHOT_PNG).size).toBeGreaterThan(0);
      expect(elapsedMs).toBeLessThan(120_000);
    },
    // takeShot's own worst case: up to 180s waiting for the cross-process
    // lock (scripts/lib/file-lock.mjs — held by a concurrent export-web run;
    // see its comment), plus 90s for the dev server, plus 90s for the first
    // page load (Metro compiles the route's bundle on that request), plus
    // 60s for the ready selector. This must clear that ~420s internal
    // ceiling with real margin, not race it.
    480_000,
  );

  it(
    '[M0-08] two consecutive runs with a frozen clock produce byte-identical PNGs',
    () => {
      execFileSync('pnpm', ['run', 'shot', '--', 'index'], {
        cwd: ROOT,
        stdio: 'pipe',
        env: { ...process.env, CI: '1' },
      });
      const first = readFileSync(SHOT_PNG);

      execFileSync('pnpm', ['run', 'shot', '--', 'index'], {
        cwd: ROOT,
        stdio: 'pipe',
        env: { ...process.env, CI: '1' },
      });
      const second = readFileSync(SHOT_PNG);

      expect(Buffer.compare(first, second)).toBe(0);
    },
    // Two full runs back to back — double the single-run ceiling above, plus
    // margin, so a slow-but-correct run never gets mistaken for a hang.
    1_000_000,
  );

  it('[M0-08] chromium installs in CI without an interactive prompt', () => {
    const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    // `playwright install` never shows a prompt on its own — this only checks
    // that CI actually runs it before the tests that need a browser, so a
    // runner with no pre-installed Chromium (unlike this dev container)
    // doesn't fail with "executable doesn't exist".
    expect(workflow).toMatch(/playwright install --with-deps chromium/);
  });
});
