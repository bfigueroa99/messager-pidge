import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

/**
 * Repo-level guards.
 *
 * These are cheap and they defend the two things a long autonomous build erodes
 * first: the purity of the engine, and the machinery that keeps the loop honest.
 */

describe('the engine stays pure and portable', () => {
  const SRC = join(ROOT, 'packages', 'flight-sim', 'src');

  const sourceFiles = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) sourceFiles(full, out);
      else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
    }
    return out;
  };

  it('[M0-01] flight-sim declares no dependencies of any kind', () => {
    // It runs in React Native, in a Deno Edge Function and in Jest. A single
    // dependency breaks one of those three, and we would not find out here.
    const pkg = JSON.parse(read('packages/flight-sim/package.json'));
    expect(pkg.dependencies).toBeUndefined();
    expect(pkg.peerDependencies).toBeUndefined();
  });

  it('[M0-01] no engine source file imports anything at all outside the engine', () => {
    for (const file of sourceFiles(SRC)) {
      const src = readFileSync(file, 'utf8');
      const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
      for (const spec of imports) {
        expect(spec.startsWith('.')).toBe(true);
      }
    }
  });

  it('[M0-01] no engine source file reads an ambient clock or an unseeded RNG', () => {
    // INV-3 and INV-4: position is derived from parameters, and a flight's fate
    // is reproducible from its seed forever.
    //
    // Comments are stripped first: several files legitimately *discuss*
    // Date.now() in explaining why they must not call it.
    const stripComments = (src: string): string =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    for (const file of sourceFiles(SRC)) {
      const code = stripComments(readFileSync(file, 'utf8'));
      expect(code).not.toMatch(/Date\.now\(\)/);
      expect(code).not.toMatch(/Math\.random\(\)/);
      expect(code).not.toMatch(/new Date\(\)/);
    }
  });

  it('[M0-01] TypeScript strict mode is on and unchecked index access is off', () => {
    const tsconfig = JSON.parse(read('tsconfig.base.json'));
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.noUncheckedIndexedAccess).toBe(true);
  });

  it('[M0-01] .gitignore covers node_modules, so the Stop hook never jams', () => {
    // The session Stop hook blocks on untracked files. A missing .gitignore
    // would stall every single loop iteration.
    const ignore = read('.gitignore');
    for (const entry of ['node_modules/', 'coverage/', '.expo/', 'dist/']) {
      expect(ignore).toContain(entry);
    }
  });
});

describe('the loop machinery is present and well-formed', () => {
  it('[M0-06] every durable state file exists', () => {
    for (const file of [
      'docs/PRODUCT.md',
      'docs/LOOP.md',
      'docs/DECISIONS.md',
      'docs/JOURNAL.md',
      'docs/QUESTIONS.md',
      'ROADMAP.md',
      'CLAUDE.md',
      '.loop/state.json',
      'scripts/check-roadmap-tests.mjs',
      'scripts/check-test-count.mjs',
    ]) {
      expect(existsSync(join(ROOT, file))).toBe(true);
    }
  });

  it('[M0-06] state.json carries a kill switch and a hard budget', () => {
    const state = JSON.parse(read('.loop/state.json'));
    expect(typeof state.paused).toBe('boolean');
    expect(typeof state.iteration).toBe('number');
    expect(typeof state.budget.max_iterations).toBe('number');
    expect(typeof state.budget.stop_after).toBe('string');
    expect(Number.isNaN(Date.parse(state.budget.stop_after))).toBe(false);
  });

  it('[M0-06] verify runs both gates, so neither can be quietly dropped', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts.verify).toContain('gate:roadmap');
    expect(pkg.scripts.verify).toContain('gate:tests');
  });

  it('[M0-06] PRODUCT.md still forbids the three things agents drift toward', () => {
    // Fast paths, undo, and streaks. If someone softens the spec, this fails
    // and the change has to be argued for rather than slipped in.
    const product = read('docs/PRODUCT.md');
    expect(product).toMatch(/No speed\./);
    expect(product).toMatch(/No undo\./);
    expect(product).toMatch(/No streaks/);
  });
});
