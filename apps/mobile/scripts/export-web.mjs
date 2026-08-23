#!/usr/bin/env node
/**
 * `expo export -p web` bundles every route reachable under `app/`, including
 * `app/_dev` — Expo Router's `require.context` glob (`expo-router/_ctx.web.js`)
 * only excludes `+api`/`+middleware`/`+html`/`+native-intent` files, nothing
 * named `_dev`. Confirmed directly: an unmodified export produced
 * `dist/_dev/[story].html` (M0-08's Do list forbids shipping it).
 *
 * So the directory is physically moved out of `app/` for the span of the
 * export and moved back afterwards, in a `finally` so a failed export still
 * restores it. The whole thing runs under the same cross-process lock
 * `scripts/shot.mjs` uses — see `scripts/lib/file-lock.mjs` for why: a
 * concurrent Metro dev server and production export otherwise starve each
 * other for CPU.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { metroCpuLockPath, withFileLock } from '../../../scripts/lib/file-lock.mjs';

const MOBILE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = join(MOBILE_ROOT, '..', '..');
const DEV_ROUTES = join(MOBILE_ROOT, 'app', '_dev');
const PARKED = join(MOBILE_ROOT, '.dev-routes-parked');

await withFileLock(metroCpuLockPath(REPO_ROOT), () => {
  // Self-heal a run that was killed between the two renames (SIGKILL, an OOM
  // kill, a container restart) — the lock itself does not protect against
  // that, since neither process's `finally` block runs on a hard kill.
  if (existsSync(PARKED)) {
    if (existsSync(DEV_ROUTES)) {
      // Both exist: a stale parked copy left by a killed run, superseded by
      // an `app/_dev` that got restored some other way (e.g. `git checkout`)
      // before this ran again. Renaming over it would throw ENOTEMPTY, and
      // the restored directory is the one to trust — discard the stale copy.
      rmSync(PARKED, { recursive: true, force: true });
    } else {
      renameSync(PARKED, DEV_ROUTES);
    }
  }

  const parked = existsSync(DEV_ROUTES);
  if (parked) renameSync(DEV_ROUTES, PARKED);
  try {
    execFileSync('expo', ['export', '-p', 'web'], { cwd: MOBILE_ROOT, stdio: 'inherit' });
  } finally {
    if (parked) renameSync(PARKED, DEV_ROUTES);
  }
});
