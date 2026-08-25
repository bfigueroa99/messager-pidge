#!/usr/bin/env node
/**
 * Lints a snippet of code (read from stdin) against the repo's real,
 * checked-in `eslint.config.mjs`, under a given fake filename (argv[2]).
 *
 * Exists only because that config file is genuine ESM and every Jest test
 * file compiles through ts-jest targeting CommonJS (see `tsconfig.base.json`)
 * — a dynamic `import()` of an `.mjs` file from that compiled output hits
 * Jest's "Must use import to load ES Module" error. Running as its own plain
 * `node` process sidesteps the transform entirely, the same way
 * `scripts/check-roadmap-tests.mjs`'s tests spawn that gate as a subprocess
 * for the identical reason.
 */
import { Linter } from 'eslint';

async function readStdin() {
  process.stdin.setEncoding('utf8');
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return chunks.join('');
}

const filename = process.argv[2];
const code = await readStdin();
const { default: config } = await import('../../eslint.config.mjs');

const linter = new Linter();
const messages = linter.verify(code, config, { filename });
process.stdout.write(JSON.stringify(messages));
