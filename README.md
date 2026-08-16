# Loft

A messenger in which every message is carried by a pigeon that must physically
cross the real distance between you and the person you are writing to, in real
time. Los Angeles to New York takes twenty-two hours. Sometimes the bird does
not arrive, and the note is destroyed.

It has no practical use. That is the point. See [`docs/PRODUCT.md`](docs/PRODUCT.md).

> "Loft" is a working name; picking the final one is roadmap item `M0-07` and
> open question `Q-001`.

## Quick start

```bash
pnpm install
pnpm run verify        # typecheck + lint + coverage + both gates
```

| Command | What it does |
|---|---|
| `pnpm test -- --selectProjects flight-sim` | The pure engine. Fast (~2 s). |
| `pnpm test -- --selectProjects db` | RLS against real Postgres via PGlite (~45 s). |
| `pnpm test -- --selectProjects repo` | Repo-level purity and machinery guards. |
| `pnpm run gate:roadmap` | Fails if a roadmap item is marked done without a test. |
| `pnpm run gate:tests` | Fails if the test count drops, or if any test is skipped. |

## How this repo is built

It is built by an autonomous loop: every twelve hours a fresh session syncs this
branch, reads [`docs/LOOP.md`](docs/LOOP.md), takes the topmost `todo` item from
[`ROADMAP.md`](ROADMAP.md), implements it, verifies it, and pushes. Its context
is discarded each time, so everything it knows lives in files:

| File | Purpose |
|---|---|
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | The spec. **Immutable** — the loop may not edit it. |
| [`docs/LOOP.md`](docs/LOOP.md) | The iteration protocol. |
| [`ROADMAP.md`](ROADMAP.md) | The backlog. One item = one iteration. |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | ADRs, append-only. |
| [`docs/JOURNAL.md`](docs/JOURNAL.md) | What each iteration did and learned. |
| [`docs/QUESTIONS.md`](docs/QUESTIONS.md) | Decisions waiting on a human. |
| `.loop/state.json` | Cursor, budget, and the kill switch. |

**To stop the loop:** set `"paused": true` in `.loop/state.json` and push. The
next iteration exits in seconds having changed nothing. It is reversible and it
works from a phone via the GitHub web editor.

**To steer it:** reorder `ROADMAP.md`, insert an item at the top, mark one
`blocked`, or answer a question in `docs/QUESTIONS.md`. Every iteration resets
hard to `origin`, so any edit takes effect on the next firing with nothing to
restart.

## Architecture

```
packages/flight-sim/   Pure TypeScript, zero dependencies. Great-circle geodesy,
                       a seeded PRNG, the speed and hazard models, the flight
                       planner, and the client-side state function. Runs
                       identically in React Native, Deno and Jest.
supabase/              Schema, RLS, the release function, the reaper. Migrations
                       are forward-only.
apps/mobile/           Expo + React Native (from M0-07).
```

The server decides everything once, at release — arrival, survival, and the
moment and place of death — all rolled from a stored seed. The client is a pure
renderer of `flightStateAt(flight, now)`. A cron job only commits side effects,
and **message visibility is gated on `now()` inside the RLS policy**, so a cron
outage delays a notification but never a message. See ADR-001 and ADR-002.

## What this repo can and cannot verify

Development happens in a Linux container with **no macOS, no Xcode, no
simulator, and no KVM**, and with a Docker client but no running daemon.

**Genuinely tested here:** the entire flight engine (pure, ~90% gated); the real
migration files, constraints, triggers and RLS policies, against a real Postgres
compiled to WASM via PGlite; repo-level purity guards.

**Not tested here, and validated elsewhere:** real GoTrue auth flows, Realtime
authorization, actual `pg_cron` scheduling, push notification delivery, native
Apple/Google map rendering, real GPS permission dialogs, and App Store build
integrity. These need a hosted Supabase dev project (see `Q-002`), EAS Build,
and a physical device with a manual QA checklist per release.

This distinction is stated rather than papered over, because an autonomous loop
that believes it has verified something it has not is worse than one that knows
the gap exists.
