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
 * or scope is exercised too, not just trusted by inspection.
 */

type LintMessage = { ruleId: string | null };

const LINT_FIXTURE_SCRIPT = join(__dirname, 'scripts', 'lint-fixture.mjs');

function lint(code: string, filename: string): LintMessage[] {
  const output = execFileSync(process.execPath, [LINT_FIXTURE_SCRIPT, filename], {
    input: code,
    encoding: 'utf8',
  });
  return JSON.parse(output);
}

describe('the voice guard', () => {
  it('[M1-01] a JSX text node with a hardcoded literal fails the lint test', () => {
    const messages = lint(
      `
        import { Text } from 'react-native';
        export function Bad() {
          return <Text>Delivery failed. Retry?</Text>;
        }
      `,
      'apps/mobile/src/ui/Fixture.tsx',
    );
    expect(messages.some((m) => m.ruleId === 'no-restricted-syntax')).toBe(true);
  });

  it('[M1-01] copy routed through t() passes the lint test', () => {
    const messages = lint(
      `
        import { Text } from 'react-native';
        import { t } from './copy/strings';
        export function Good() {
          return <Text>{t({ key: 'offline' })}</Text>;
        }
      `,
      'apps/mobile/src/ui/Fixture.tsx',
    );
    expect(messages.some((m) => m.ruleId === 'no-restricted-syntax')).toBe(false);
  });

  it('[M1-01] an expression-only JSX child never trips the guard', () => {
    const messages = lint(
      `
        import { Text } from 'react-native';
        export function Named({ name }: { name: string }) {
          return <Text>{name}</Text>;
        }
      `,
      'apps/mobile/src/ui/Fixture.tsx',
    );
    expect(messages.some((m) => m.ruleId === 'no-restricted-syntax')).toBe(false);
  });

  it('[M1-01] dev-only screenshot tooling under app/_dev is exempt from the guard', () => {
    const messages = lint(
      `
        import { Text } from 'react-native';
        export function DevOnly() {
          return <Text>Unknown story</Text>;
        }
      `,
      'apps/mobile/app/_dev/Fixture.tsx',
    );
    expect(messages.some((m) => m.ruleId === 'no-restricted-syntax')).toBe(false);
  });
});
