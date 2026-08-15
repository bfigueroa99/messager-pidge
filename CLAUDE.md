# Loft — repo conventions

Read `docs/PRODUCT.md` for **what** we are building and `docs/LOOP.md` for
**how** work proceeds. This file is only *how we write code here*.

## Stack

pnpm workspaces · TypeScript strict · Jest · Supabase (Postgres, RLS, Edge
Functions, pg_cron) · Expo SDK 57 + React Native 0.86 (the app, from `M0-06`).

## The layering rule — this is load-bearing

```
packages/flight-sim/   Pure TypeScript. ZERO dependencies. No react, no expo,
                       no @supabase, no node builtins. No Date.now(), no
                       Math.random() — time and randomness are parameters.
                       Runs in React Native, in Deno, and in Jest.
supabase/              Migrations, RLS, Edge Functions. Forward-only.
apps/mobile/src/       Screens and components. Thin. If you are computing
                       something in a component, it belongs in flight-sim.
```

**This container has no macOS, no Xcode, no simulator, and no KVM. The UI cannot
be verified by running it.** Therefore: push logic down into `packages/flight-sim`
until the UI is trivially, obviously correct. This is not a style preference, it
is the only way this codebase can be trusted. ESLint enforces it — see the
`no-restricted-imports` block in `eslint.config.mjs`.

## Commands

```bash
pnpm install
pnpm run verify      # typecheck + lint + coverage + roadmap gate + test-count gate
pnpm run typecheck
pnpm run lint
pnpm test
pnpm test -- --selectProjects flight-sim   # fast: the pure engine only
pnpm test -- --selectProjects db           # slower: PGlite + real migrations
```

`verify` is what the pre-commit hook runs, what CI runs, and what every
iteration must leave green.

## Testing

- **`flight-sim` is gated at 90% statements / 85% branches.** It is pure and it
  is the product. Do not chase coverage anywhere else.
- **The RLS suite runs against real Postgres**, compiled to WASM via PGlite,
  with the real migration files. Docker is unavailable here, so `supabase start`
  is not an option. `supabase/tests/shims/00_pre.sql` stands in for `auth`,
  `cron` and `realtime`.
- PGlite needs `NODE_OPTIONS=--experimental-vm-modules`; the npm scripts already
  set it.
- **Every test name must contain its roadmap item ID in brackets** —
  `it('[M1-04] …')`. `pnpm run gate:roadmap` fails the build otherwise, and that
  gate is what stops items being marked done without evidence.

## Rules

- TypeScript `strict: true`. No `any`. No `@ts-ignore` without an adjacent
  comment explaining why and a roadmap item to remove it.
- **No new runtime dependency without an ADR** in `docs/DECISIONS.md`.
- **Never weaken, skip, or delete an existing test to make a build pass.** If a
  test is genuinely wrong, that is its own roadmap item with its own rationale.
- **Never add a fast path, an undo, or a streak.** See `docs/PRODUCT.md` §8.
  These are the three things an autonomous agent reliably drifts toward.
- Time is always epoch milliseconds, always UTC, always named `*Ms` or `*At`.
- Migrations are forward-only. Never edit a merged migration; add a new one.
- Commit messages: `<ITEM-ID>: imperative summary`
  (e.g. `M1-04: render the flight card countdown`).

## Two traps worth knowing before you touch SQL

- Write `(select auth.uid())`, never bare `auth.uid()`. The scalar subquery lets
  Postgres hoist it into an InitPlan and evaluate it once per query instead of
  once per row — a 50–100× difference on a large scan. Do not "simplify" these.
- `landed_at` is set from `resolve_at`, never from `now()`, so cron jitter never
  leaks into a timestamp a user can see.
