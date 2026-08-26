import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * `[M1-01]` The voice guard is the `no-restricted-syntax` block
 * `eslint.config.mjs` adds for `apps/mobile/src/ui/**` and
 * `apps/mobile/app/**`: a JSXText node containing a letter is a hardcoded
 * literal, and `docs/PRODUCT.md` §5 says user-facing copy only ever comes
 * from `apps/mobile/src/ui/copy/strings.ts`'s `t()`.
 *
 * This lints against the real, checked-in `eslint.config.mjs` — the same
 * config `pnpm run lint` runs — via `tests/scripts/lint-fixture.mjs`, rather
 * than reimplementing the selector here, so a change to the guard's wording
 * or scope is exercised too, not just trusted by inspection. All fixtures are
 * sent to the script in one batch (one process spawn, one config import)
 * rather than one process per fixture.
 */

type LintMessage = { ruleId: string | null };
type Fixture = { code: string; filename: string };

const LINT_FIXTURE_SCRIPT = join(__dirname, 'scripts', 'lint-fixture.mjs');

const FIXTURES = {
  hardcodedLiteral: {
    code: `
      import { Text } from 'react-native';
      export function Bad() {
        return <Text>Delivery failed. Retry?</Text>;
      }
    `,
    filename: 'apps/mobile/src/ui/Fixture.tsx',
  },
  routedThroughT: {
    code: `
      import { Text } from 'react-native';
      import { t } from './copy/strings';
      export function Good() {
        return <Text>{t({ key: 'offline' })}</Text>;
      }
    `,
    filename: 'apps/mobile/src/ui/Fixture.tsx',
  },
  expressionOnlyChild: {
    code: `
      import { Text } from 'react-native';
      export function Named({ name }: { name: string }) {
        return <Text>{name}</Text>;
      }
    `,
    filename: 'apps/mobile/src/ui/Fixture.tsx',
  },
  devOnlyExempt: {
    code: `
      import { Text } from 'react-native';
      export function DevOnly() {
        return <Text>Unknown story</Text>;
      }
    `,
    filename: 'apps/mobile/app/_dev/Fixture.tsx',
  },
} as const satisfies Record<string, Fixture>;

function lintBatch(fixtures: Record<string, Fixture>): Record<string, LintMessage[]> {
  const keys = Object.keys(fixtures);
  const output = execFileSync(process.execPath, [LINT_FIXTURE_SCRIPT], {
    input: JSON.stringify(keys.map((key) => fixtures[key])),
    encoding: 'utf8',
  });
  const results: LintMessage[][] = JSON.parse(output);
  return Object.fromEntries(keys.map((key, i) => [key, results[i]]));
}

describe('the voice guard', () => {
  const results = lintBatch(FIXTURES);
  const trips = (key: keyof typeof FIXTURES) => results[key].some((m) => m.ruleId === 'no-restricted-syntax');

  it('[M1-01] a JSX text node with a hardcoded literal fails the lint test', () => {
    expect(trips('hardcodedLiteral')).toBe(true);
  });

  it('[M1-01] copy routed through t() passes the lint test', () => {
    expect(trips('routedThroughT')).toBe(false);
  });

  it('[M1-01] an expression-only JSX child never trips the guard', () => {
    expect(trips('expressionOnlyChild')).toBe(false);
  });

  it('[M1-01] dev-only screenshot tooling under app/_dev is exempt from the guard', () => {
    expect(trips('devOnlyExempt')).toBe(false);
  });
});
