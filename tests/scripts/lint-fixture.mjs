#!/usr/bin/env node
/**
 * Lints a batch of code snippets — a JSON array of `{code, filename}` on
 * stdin — against the repo's real, checked-in `eslint.config.mjs`, and
 * writes a JSON array of each fixture's lint messages, same order, to
 * stdout.
 *
 * Exists only because that config file is genuine ESM and every Jest test
 * file compiles through ts-jest targeting CommonJS (see `tsconfig.base.json`)
 * — a dynamic `import()` of an `.mjs` file from that compiled output hits
 * Jest's "Must use import to load ES Module" error. Running as its own plain
 * `node` process sidesteps the transform entirely, the same way
 * `scripts/check-roadmap-tests.mjs`'s tests spawn that gate as a subprocess
 * for the identical reason. Batched rather than one process per fixture so a
 * test file with several fixtures pays the process-spawn and config-import
 * cost once, not once per case.
 */
import { Linter } from 'eslint';

async function readStdin() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

const fixtures = JSON.parse(await readStdin());
const { default: config } = await import('../../eslint.config.mjs');

const linter = new Linter();
const results = fixtures.map(({ code, filename }) => linter.verify(code, config, { filename }));
process.stdout.write(JSON.stringify(results));
