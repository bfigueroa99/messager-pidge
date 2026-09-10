import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = join(__dirname, '..');
const MOBILE = join(ROOT, 'apps', 'mobile');
const TSC = join(ROOT, 'node_modules', '.bin', 'tsc');

/** Every `.js`/`.d.ts` under a source directory, found by walking it. */
function compiledArtifactsUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...compiledArtifactsUnder(full));
    else if (entry.endsWith('.js') || entry.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/** Removes every build artifact the composite build can leave behind. */
function cleanBuildOutputs(): void {
  for (const p of [
    join(MOBILE, '.tsc-out'),
    join(MOBILE, 'tsconfig.tsbuildinfo'),
    join(ROOT, 'packages', 'flight-sim', 'dist'),
    join(ROOT, 'packages', 'flight-sim', 'tsconfig.tsbuildinfo'),
    join(ROOT, 'tsconfig.tsbuildinfo'),
  ]) {
    rmSync(p, { recursive: true, force: true });
  }
}

describe('[M0-14] apps/mobile composite project has an outDir', () => {
  const tsconfig = JSON.parse(readFileSync(join(MOBILE, 'tsconfig.json'), 'utf8'));

  it('[M0-14] tsconfig.json declares an outDir outside app/ and src/', () => {
    const outDir = tsconfig.compilerOptions.outDir;
    expect(typeof outDir).toBe('string');

    const resolved = resolve(MOBILE, outDir);
    expect(resolved.startsWith(join(MOBILE, 'app'))).toBe(false);
    expect(resolved.startsWith(join(MOBILE, 'src'))).toBe(false);
  });

  it("[M0-14] the outDir does not collide with expo export's fixed apps/mobile/dist", () => {
    // `expo export -p web` (M0-07) always writes to `apps/mobile/dist` and
    // `tests/web-export.test.ts` deletes and repopulates that exact directory.
    // A composite-build outDir of `./dist` would race with it.
    const resolved = resolve(MOBILE, tsconfig.compilerOptions.outDir);
    expect(resolved).not.toBe(join(MOBILE, 'dist'));
  });

  it(
    "[M0-14] a forced-emit composite build lands every file under the outDir, none beside their sources",
    () => {
      // `tsc -b` alone never emits here — `noEmit: true` from `expo/tsconfig.base`
      // suppresses it, matching normal `pnpm run typecheck`. But the bug this
      // item guards against (M0-14's own history: a fresh container emitted
      // `.js`/`.d.ts` next to every apps/mobile source file on its first `tsc -b`
      // after `pnpm install`) is exactly emission happening despite that. Forcing
      // it here with `--noEmit false` reproduces that condition on demand and
      // proves it now lands in `outDir` instead of beside the source — confirmed
      // this test fails, with artifacts appearing under apps/mobile/app and
      // apps/mobile/src, against the pre-fix tsconfig (no outDir).
      cleanBuildOutputs();
      try {
        execFileSync(TSC, ['-b', '--pretty', 'false', '--noEmit', 'false'], {
          cwd: ROOT,
          encoding: 'utf8',
        });

        expect(compiledArtifactsUnder(join(MOBILE, 'app'))).toEqual([]);
        expect(compiledArtifactsUnder(join(MOBILE, 'src'))).toEqual([]);
        expect(compiledArtifactsUnder(join(MOBILE, '.tsc-out')).length).toBeGreaterThan(0);
      } finally {
        cleanBuildOutputs();
      }
    },
    30000,
  );
});
