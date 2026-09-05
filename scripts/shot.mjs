#!/usr/bin/env node
/**
 * `pnpm run shot -- <story>` (M0-08).
 *
 * This container has no simulator, so a headless browser is the only way any
 * agent will ever see the app. This script boots the Expo web dev server,
 * navigates a headless Chromium to a dev-only story route, waits for the
 * story to mark itself ready, and writes a PNG to `artifacts/shots/`.
 *
 * The clock is frozen via a `?t=<epoch_ms>` query parameter rather than the
 * real clock, so two runs of the same story produce byte-identical output —
 * see tests/shot.test.ts.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { metroCpuLockPath, withFileLock } from './lib/file-lock.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Fixed by default so consecutive runs are deterministic; overridable for a
// story that wants to demonstrate a different point in time.
const DEFAULT_FROZEN_AT_MS = 1_700_000_000_000;

// Playwright's own chromium download is unavailable in some containers; this
// image pre-installs a build outside playwright's managed cache. Prefer it
// when present and fall back to playwright's normal resolution (a real CI
// runner that ran `playwright install chromium`) otherwise.
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium';

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, server, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.hasExited()) {
      throw new Error(`dev server exited before it ever answered at ${url}`);
    }
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`dev server never answered at ${url} within ${timeoutMs}ms`);
}

function startDevServer(port) {
  const child = spawn(
    'pnpm',
    ['--filter', 'mobile', 'exec', 'expo', 'start', '--web', '--port', String(port)],
    {
      cwd: ROOT,
      stdio: 'pipe',
      detached: true,
      // `@react-native/dev-middleware` refuses to launch its debugger tooling
      // under `NODE_ENV=test` unless mocked (it assumes it is being unit
      // tested) — real here because `tests/shot.test.ts` spawns this from
      // inside Jest, which sets NODE_ENV=test on the whole process tree.
      env: { ...process.env, CI: '1', BROWSER: 'none', NODE_ENV: 'development' },
    },
  );
  let output = '';
  let exited = false;
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  child.on('exit', () => {
    exited = true;
  });
  // Without this, a spawn failure (pnpm missing from PATH, EMFILE under CI
  // load) emits an unhandled 'error' event, which Node treats as an uncaught
  // exception and crashes the whole process — bypassing takeShot's catch
  // block entirely, including the diagnostic dev-server output it attaches.
  child.on('error', (err) => {
    output += `\n[spawn error] ${err.message}`;
    exited = true;
  });
  return {
    child,
    getOutput: () => output,
    hasExited: () => exited,
    stop() {
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          // Already gone.
        }
      }
    },
  };
}

export async function takeShot(story, { frozenAtMs = DEFAULT_FROZEN_AT_MS } = {}) {
  // Shared with apps/mobile/scripts/export-web.mjs — a live Metro dev server
  // and a full production `expo export` genuinely starve each other for CPU
  // when both happen to run at once (confirmed directly; see file-lock.mjs).
  return withFileLock(metroCpuLockPath(ROOT), () => takeShotUnlocked(story, frozenAtMs));
}

async function takeShotUnlocked(story, frozenAtMs) {
  const port = await freePort();
  const server = startDevServer(port);
  let browser;
  try {
    const base = `http://127.0.0.1:${port}`;
    await waitForServer(base, server, 90_000);

    browser = await chromium.launch({
      executablePath: existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined,
    });
    const page = await browser.newPage({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
    });

    await page.goto(`${base}/_dev/${encodeURIComponent(story)}?t=${frozenAtMs}`, {
      waitUntil: 'load',
      // Playwright's 30s default doesn't budget for Metro compiling the
      // route's bundle on this first request, which is the actual work
      // 'load' is waiting on — matches the dev-server-boot allowance above,
      // since a cold/contended compile is the same order of cost either way.
      timeout: 90_000,
    });
    // Raced against the not-found marker so a typo'd story name fails fast
    // with a clear message instead of waiting out the full ready timeout, or
    // worse, matching "ready" on some unrelated element and silently writing
    // a placeholder screenshot.
    const outcome = await Promise.race([
      page.waitForSelector('[data-testid="ready"]', { timeout: 60_000 }).then(() => 'ready'),
      page
        .waitForSelector('[data-testid="story-not-found"]', { timeout: 60_000 })
        .then(() => 'not-found'),
    ]);
    if (outcome === 'not-found') {
      throw new Error(
        `no story named "${story}" — check the STORIES map in apps/mobile/app/_dev/[story].tsx`,
      );
    }

    const outDir = join(ROOT, 'artifacts', 'shots');
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, `${story}.png`);
    await page.screenshot({ path: outPath });
    return outPath;
  } catch (err) {
    throw new Error(`${err.message}\n\n--- dev server output ---\n${server.getOutput()}`);
  } finally {
    await browser?.close();
    server.stop();
  }
}

async function main() {
  // Unlike npm, `pnpm run shot -- index` forwards the `--` itself as a
  // literal argv entry instead of stripping it — confirmed directly against
  // both package managers with an identical script. Drop any leading ones.
  const story = process.argv.slice(2).find((arg) => arg !== '--');
  if (!story) {
    console.error('usage: pnpm run shot -- <story>');
    process.exit(1);
  }
  const outPath = await takeShot(story);
  console.log(`wrote ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
