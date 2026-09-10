import { scaledNow } from '@pidge/flight-sim';

/**
 * The clock every screen's `now: () => number` prop is ultimately backed by
 * (M1-09). `EXPO_PUBLIC_TIME_SCALE` only ever takes effect when
 * `EXPO_PUBLIC_E2E` is also exactly `'true'` — a production build reads the
 * real clock unchanged no matter what `EXPO_PUBLIC_TIME_SCALE` says, so the
 * scale can never leak into a shipped app. Both are `EXPO_PUBLIC_*`, so
 * they're inlined into the client bundle, never a secret (see
 * `.env.example`).
 *
 * Every `process.env.EXPO_PUBLIC_*` access below is a literal member
 * expression at its call site, on purpose: `babel-preset-expo`'s
 * `inline-env-vars` plugin only rewrites/inlines that exact AST shape
 * (`process.env.<KEY>` where `object.object` is literally the identifier
 * `process`) — reading these off a destructured or reassigned `env`
 * variable would typecheck and pass under Jest (plain Node, no
 * Metro/babel involved) while silently never resolving in the real bundled
 * app. Do not refactor these into a shared `env` parameter no matter how
 * repetitive they look.
 */
export interface ClockDeps {
  readonly now: () => number;
}

const DEFAULT_SCALE = 1;

function readTimeScale(): number {
  if (process.env.EXPO_PUBLIC_E2E !== 'true') return DEFAULT_SCALE;
  const parsed = Number(process.env.EXPO_PUBLIC_TIME_SCALE);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SCALE;
}

/**
 * `epochMs` is the real instant scaling starts counting from — callers must
 * create a fresh `ClockDeps` at the moment they start watching (a screen's
 * own mount, never a module-level singleton captured once at app boot),
 * otherwise elapsed time since boot keeps compounding at `scale`x and a
 * flight opened long after launch reads as already finished. `realNow` is
 * injectable so a test can drive `now()` without a real timer; the env is
 * always read live on every call, matching how `EXPO_PUBLIC_TIME_SCALE`
 * could change between renders in a dev client.
 */
export function createClockDeps(epochMs: number, options: { readonly realNow?: () => number } = {}): ClockDeps {
  const realNow = options.realNow ?? Date.now;
  return { now: () => scaledNow(epochMs, realNow(), readTimeScale()) };
}
