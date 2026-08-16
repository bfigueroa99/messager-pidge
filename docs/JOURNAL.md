# Iteration journal

Append-only, newest at the bottom. One block per iteration. Keep it terse — a
future agent reads the last five blocks, not the whole file.

The **"Surprises for the next agent"** line is mandatory and must be non-empty.
It is the highest-value sentence in each block: it is how one iteration's hard-won
knowledge survives a context reset.

---

## Iteration 0 — 2026-08-15 — BOOTSTRAP

- **Outcome:** done
- **Verify:** typecheck ok · lint ok · 86 tests ok · flight-sim coverage 99.5%
  statements / 89.7% branches
- **What landed:** the pnpm workspace; `packages/flight-sim` (geo, seeded RNG,
  speed, hazard, planner, client state, formatting) with 57 tests; the Supabase
  schema, RLS policies, `release_pigeon` and the reaper, with 20 tests running
  against real Postgres via PGlite; the loop machinery (PRODUCT, LOOP, CLAUDE,
  DECISIONS, QUESTIONS, ROADMAP, state.json, both gate scripts, CI).
- **Surprises for the next agent:**
  - **Docker's daemon is not running in this container**, so `supabase start`
    fails. Database tests go through PGlite instead (ADR-006). A native
    Postgres 16 *is* installed at `/usr/lib/postgresql/16/bin` and works if
    PGlite ever falls short — but it refuses to run as root, so it needs an
    unprivileged user and a data directory that user can traverse.
  - **PGlite needs `NODE_OPTIONS=--experimental-vm-modules`** or it dies with
    `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG`. The npm scripts set it; if you
    invoke `npx jest` directly you must set it yourself.
  - **PGlite connects as a superuser, who bypasses RLS entirely.** Any test that
    queries via `db.query` directly is testing nothing. Everything that matters
    must go through `asUser()` / `asAnon()` in `supabase/tests/harness.ts`.
  - RLS needs table-level GRANTs before policies are even consulted. The shim
    uses `alter default privileges` *before* the migrations run, which mirrors
    what Supabase does and leaves migration 0003's `revoke` on `flight_secrets`
    correctly on top. Granting after the migrations would silently un-revoke the
    vault.
  - The engine's calibration was checked independently: LA→NYC great circle is
    3,936 km, and 110 mph gives 22.2 h — matching the original's stated 22 hours.
    The golden PRNG vector in `rng.test.ts` was generated from the
    implementation, so if you change `mulberry32` that test is supposed to fail.
- **Follow-ups filed:** the whole of `ROADMAP.md`; Q-001 (the app's name) and
  Q-002 (a real Supabase project) in `docs/QUESTIONS.md`.

---

## Iteration 1 — 2026-08-15 — protocol fix after the first CI run

- **Outcome:** done
- **Verify:** typecheck ok · lint ok · 86 tests ok
- **What landed:** `docs/LOOP.md` §1 now distinguishes a check that ran and
  failed from one GitHub never scheduled. Q-003 filed.
- **Surprises for the next agent:**
  - **GitHub Actions does not currently run in this repository.** Three `verify`
    runs all completed in ~2 s with `runner_id: 0`, no runner name, no step
    output and a 404 on the logs. That is a repository/account setting, not a
    build failure — no commit fixes it.
  - This nearly deadlocked the loop before it started: the protocol said "CI red
    preempts everything", which would have spent all 60 iterations trying to fix
    something outside the repo. **`pnpm run verify` is the real gate.** Treat CI
    as a second pair of eyes.
  - `main` is an empty root commit, created only so this branch had a base to
    open a PR against — the repository had no commits at all. Do not be confused
    by the one-commit merge in the history.
- **Follow-ups filed:** Q-003 (enable GitHub Actions).

  - **Sessions fired by the Routine have no `mcp__github__*` tools.** The
    Routine could not pass connector grants through. `git push` still works via
    the container's credentials, so this only affects reading CI and editing the
    PR description — both now explicitly optional in `docs/LOOP.md`. Do not try
    to work around it with `curl`.

---

## Iteration 2 — 2026-08-16 — the first fired session failed silently

- **Outcome:** failed (diagnosed from outside; the session left no trace of its own)
- **What happened:** the first Routine firing ran for 3.5 minutes, spent ~11k
  output tokens, went IDLE, and pushed nothing. No remote branch changed. It did
  not record why.
- **Surprises for the next agent:**
  - **The environment's configured source revision is `refs/heads/master`, which
    does not exist in this repository** (only `main` and the working branch do).
    A fired container may therefore hand you an empty, detached, or missing
    checkout. `docs/LOOP.md` §0 now locates the repo across several paths and
    clones it fresh if needed. Do not assume a working directory.
  - The deeper failure was not stopping — it was **stopping without a trace**.
    From outside, "container broken", "protocol wrong" and "agent gave up" all
    look identical. `docs/LOOP.md` now opens with a rule that outranks the rest:
    finish with a pushed commit, or a pushed explanation, or an explicit
    "paused". Never silence.
  - A disconnected fired session is **not reachable** via `ListAgents` /
    `SendMessage`, so a future agent cannot interrogate a failed predecessor.
    The repository is the only channel between iterations. Write things down.
- **Follow-ups filed:** none — both fixes landed in this commit.
