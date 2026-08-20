import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'apps', 'mobile', 'dist');

/**
 * The web bundle is not a nice-to-have here: this container has no simulator,
 * so the browser is the only way any agent will ever see this app (M0-08). A
 * broken export means the UI goes unverifiable, silently. It is worth the
 * ~30 seconds this costs.
 */
describe('the app exports for the web', () => {
  it(
    '[M0-07] `expo export -p web` produces a bundle without error',
    () => {
      rmSync(DIST, { recursive: true, force: true });

      execFileSync('pnpm', ['--filter', 'mobile', 'run', 'export:web'], {
        cwd: ROOT,
        stdio: 'pipe',
        env: { ...process.env, CI: '1' },
      });

      expect(existsSync(join(DIST, 'index.html'))).toBe(true);
      const bundles = readdirSync(join(DIST, '_expo', 'static', 'js', 'web'));
      expect(bundles.some((f) => f.endsWith('.js'))).toBe(true);
    },
    300_000,
  );
});
