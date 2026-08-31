import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const SHOT_PNG = join(ROOT, 'artifacts', 'shots', 'index.png');
const FLIGHT_MAP_SHOT_PNG = join(ROOT, 'artifacts', 'shots', 'flight-map.png');

function runShot(story: string, pngPath: string): Buffer {
  execFileSync('pnpm', ['run', 'shot', '--', story], {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, CI: '1' },
  });
  return readFileSync(pngPath);
}

// Set by the first test below and read by the second, so a failure or an
// isolated run of the second test (e.g. `jest -t`) fails loudly on a missing
// buffer instead of silently comparing against a stale index.png left on
// disk by some earlier, unrelated run.
let firstRunPng: Buffer | undefined;

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
      firstRunPng = runShot('index', SHOT_PNG);
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
      // Reuses the PNG the test above just produced as the "first" run instead
      // of paying for a third full pipeline invocation — `it`s in one
      // `describe` run in declaration order in a single process, the same
      // reasoning `tests/web-export.test.ts` relies on for its own
      // no-`_dev`-route check. Read from the variable the previous test set,
      // not the file it wrote, so a failed or skipped previous test fails
      // this one loudly instead of comparing against a stale file on disk.
      if (!firstRunPng) {
        throw new Error(
          'firstRunPng is unset — the previous test must run first and succeed',
        );
      }
      const second = runShot('index', SHOT_PNG);

      expect(Buffer.compare(firstRunPng, second)).toBe(0);
    },
    // One full run — same ceiling as the test above, plus margin, so a
    // slow-but-correct run never gets mistaken for a hang.
    480_000,
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

/**
 * `[M1-13]` The chart is the first `_dev` story that draws anything beyond
 * plain text (`FlightMap`, a Tokyo-LA route chosen specifically to cross the
 * antimeridian). Reuses `pnpm run shot`'s same byte-identical-under-a-frozen-clock
 * guarantee `M0-08` already established for the `index` story, applied to a
 * second one, rather than trusting that guarantee generalizes untested.
 */
describe('the chart can be seen headlessly', () => {
  let firstFlightMapPng: Buffer | undefined;

  it(
    '[M1-13] two consecutive frozen-clock screenshots of the drawn route are byte-identical',
    () => {
      rmSync(FLIGHT_MAP_SHOT_PNG, { force: true });

      firstFlightMapPng = runShot('flight-map', FLIGHT_MAP_SHOT_PNG);
      expect(existsSync(FLIGHT_MAP_SHOT_PNG)).toBe(true);
      expect(statSync(FLIGHT_MAP_SHOT_PNG).size).toBeGreaterThan(0);

      const second = runShot('flight-map', FLIGHT_MAP_SHOT_PNG);
      expect(Buffer.compare(firstFlightMapPng, second)).toBe(0);
    },
    // Two full pipeline runs back to back — same per-run ceiling as the
    // `index` story's own test above, doubled.
    960_000,
  );
});
