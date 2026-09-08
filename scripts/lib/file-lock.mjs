/**
 * A cross-process mutex backed by `mkdir`'s atomicity (only one caller's
 * `mkdirSync` on the same path can ever succeed — the others get `EEXIST`).
 * A plain in-process lock cannot coordinate across the separate OS processes
 * Jest workers actually are, and this needs to.
 *
 * Used by `scripts/shot.mjs` and `apps/mobile/scripts/export-web.mjs` to
 * serialize their Metro/Expo bundling — confirmed directly that a live Metro
 * dev server (the shot script) and a full production `expo export -p web`
 * (the export script) genuinely starve each other for CPU when Jest happens
 * to schedule both test files' heavy work at the same moment: forcing them
 * onto two workers reproduced a `[data-testid="ready"]` timeout on every
 * attempt. Sharing this lock means the two are never actually concurrent,
 * whichever test file gets there first.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// Generous relative to the two real holders' own typical runtimes (a single
// `expo export -p web` or a screenshot's dev-server boot each normally land
// well under a minute — see tests/shot.test.ts and tests/web-export.test.ts —
// so 180s of *waiting* for one to finish is already several times worst-case
// slow, not the expected case) without being so large that a genuinely stuck
// holder reports as ordinary slowness instead of the clear error below.
const DEFAULT_TIMEOUT_MS = 180_000;

export async function withFileLock(lockDir, fn, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      mkdirSync(lockDir);
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (Date.now() > deadline) {
        throw new Error(
          `timed out after ${timeoutMs}ms waiting for ${lockDir} — another process appears ` +
            'to be stuck holding it. Remove it by hand once you have confirmed nothing is running.',
        );
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
}

// Re-exported so both call sites agree on one physical lock without either
// having to know the other's directory layout.
export function metroCpuLockPath(repoRoot) {
  return join(repoRoot, 'apps', 'mobile', '.metro-cpu.lock');
}
