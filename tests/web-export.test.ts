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
    // Includes headroom for export-web.mjs's own up-to-180s wait on the
    // cross-process lock it shares with scripts/shot.mjs (see
    // scripts/lib/file-lock.mjs), on top of the export itself.
    400_000,
  );

  // Reuses the export the test above just produced — `it`s in one describe
  // run in declaration order in a single process, so this is never racing a
  // second `expo export`. tests/shot.test.ts used to run its own second
  // export for this, and it raced this test's when Jest scheduled both
  // files' heavy work at the same moment: confirmed directly, forcing both
  // files onto two workers reproduced a `[data-testid="ready"]` timeout three
  // times running (the Metro dev server that same test also starts was
  // starved of CPU by a concurrent full production bundle+minify).
  it('[M0-08] the exported production web bundle contains no _dev route', () => {
    expect(existsSync(join(DIST, '_dev'))).toBe(false);
    // The dev route file itself must have survived the export unmoved, or
    // `expo start --web` would break for the next agent who wants to see it.
    expect(existsSync(join(ROOT, 'apps', 'mobile', 'app', '_dev', '[story].tsx'))).toBe(true);
  });
});
