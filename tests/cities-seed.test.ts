import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * `[M1-03]` `supabase/migrations/0009_seed_cities.sql` is generated from
 * `apps/mobile/src/data/cities.json` by `scripts/generate-cities-seed.mjs`
 * (`pnpm run seed:cities`) — this proves the committed migration still
 * matches the source JSON, the same way `build-engine.test.ts` proves the
 * committed engine bundle matches `packages/flight-sim/src`.
 */
describe('the cities seed migration', () => {
  it('[M1-03] the committed migration matches apps/mobile/src/data/cities.json', () => {
    expect(() =>
      execFileSync(process.execPath, [join(__dirname, '..', 'scripts', 'generate-cities-seed.mjs'), '--check'], {
        encoding: 'utf8',
      }),
    ).not.toThrow();
  });
});
