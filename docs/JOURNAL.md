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

---

## Iteration 3 — 2026-08-16 — a controlled diagnostic settled it

- **Outcome:** done. Full report in `docs/DIAGNOSTIC.md`.
- **What we learned:** a freshly created session in this environment can do
  *everything* the loop needs. It reached the repo, fetched, checked out the
  branch, installed 390 packages in 2 s, ran `pnpm run verify` green in 58 s,
  and pushed. **It was never blocked by a permission**, not once. So the two
  silent failures were not caused by permissions, network, the proxy, or the
  toolchain — all of which were suspects and are now ruled out.
- **Surprises for the next agent:**
  - **`node_modules` does NOT survive into a new container. Run `pnpm install`
    first, always.** The protocol did not say so until now, which meant an agent
    following it exactly would run `verify` with no `tsc`, `eslint` or `jest`
    installed and fail for a reason unrelated to its own work. Fixed in §0.
  - **`pnpm run verify` takes ~60 s, about 50 of them the PGlite suite compiling
    Postgres to WASM.** It is working, not hung. Do not kill it, do not run two
    at once.
  - The container clones **only the working branch**; `origin/main` does not
    exist locally until you `git fetch origin`.
  - The successful diagnostic differed from the two failed firings in exactly
    two ways: it was created with an explicit `source_revision` pointing at the
    working branch (the Routine's sessions inherit the environment's
    `refs/heads/master`, which does not exist), and it carried a self-contained
    prompt with a hard "you must push something" rule. Both failed firings had
    also read the *old* `docs/LOOP.md`, which lacked the repo-discovery fallback
    and the never-be-silent rule — those landed one minute after the second
    firing began.
- **Follow-ups filed:** none. Next step is to re-enable the Routine and fire once
  against the corrected protocol.

---

## Iteration 4 — 2026-08-16 — the actual cause: a classifier denial

- **Outcome:** done. `docs/DIAGNOSTIC.md` was extended with the evidence.
- **Correction to iteration 3.** That entry said permissions were ruled out.
  That was premature: the diagnostic had only checked steps 1-9. Afterwards a
  plain read-only `git config --get core.hooksPath; ls .git/hooks` was denied
  outright by the auto-mode classifier. Permissions were never ruled out.
- **Surprises for the next agent:**
  - **A Bash command can be denied with no warning, and the denial text tells
    you to "STOP and explain to the user".** There is no user. An iteration that
    obeys that sentence produces exactly the observed failure: ~3 minutes, no
    push, no trace. `docs/LOOP.md` now covers this directly, at the top.
  - The denial hit a *compound* command (`a; b`). Running the halves separately
    worked instantly. Other `;`-chained commands in the same run were not
    denied, so the trigger is inconsistent — **prefer one command per Bash call,
    and prefer Read/Glob/Grep over shell equivalents.**
  - **There is no pre-commit hook.** `core.hooksPath` is unset and `.git/hooks`
    holds only `.sample` files. `CLAUDE.md` claimed the hook ran `verify`; that
    was false and is now corrected. Nothing gates your commits but you.
- **Follow-ups filed:** none. The mitigation is behavioural and is in the
  protocol. If denials turn out to be frequent rather than occasional, the next
  lever is a `.claude/settings.json` allowlist — which needs the owner's
  consent, since it widens what an unattended agent may run.

---

## Iteration 5 — 2026-08-16 — the loop is paused; the cause is outside the repo

- **Outcome:** the Routine is disabled. Nothing in this repository will fix it.
- **What happened:** the third firing (12:17:41 UTC, jitter over a 12:11 cron)
  pushed nothing in 3.5 hours and left no trace, exactly like the first two —
  this time *with* the hardened protocol and *with* `.claude/settings.json`
  allowlisting git and pnpm. Two mitigations, no change in outcome.
- **The sharpest clue, and why it points outward:** `docs/LOOP.md` §2 requires a
  session to commit and push a **claim** *before* implementing anything. That
  push takes seconds. Its absence means the session never reached §2 at all — it
  died in §0/§1, while syncing or orienting, before it had any work to do. Every
  fix we shipped applies to §3 onward, which is why none of them moved the
  needle.
- **What is already ruled out** (see `docs/DIAGNOSTIC.md`): the container, the
  network, the npm registry, the git remote, the toolchain, and the permission
  surface. A session created with an explicit `source_revision` did the entire
  job — clone, install, verify green, push — in under four minutes.
- **The one difference left:** Routine-fired sessions inherit the environment's
  configured source, `refs/heads/master`, which **does not exist** in this
  repository. The successful diagnostic was created with `source_revision` set
  to the working branch. That is the only variable not yet controlled, and it
  sits in the environment configuration, not in git.
- **Surprises for the next agent:**
  - **Do not spend an iteration re-fixing `docs/LOOP.md`.** Three protocol
    revisions and an allowlist produced identical silence. The protocol is not
    what is failing.
  - A trace-less failure is still evidence: **what did not get pushed tells you
    where the session died.** No claim commit means it never selected an item.
- **Follow-ups filed:** Q-004 (fix the environment's source revision).

---

## Iteration 2 — 2026-08-20 — M0-07, the Expo app shell

- **Outcome:** done
- **Verify:** typecheck ok · lint ok · 91 tests ok · flight-sim coverage 99.5%
  statements / 89.7% branches
- **What landed:** `apps/mobile` — Expo SDK 57, React Native 0.86, `expo-router`
  file routing, a typed `app.config.ts` with EAS `development`/`preview`/
  `production` profiles, a monorepo-aware Metro config, and one route rendering
  the app name. Five tests carry `[M0-07]`, one of which runs the real
  `expo export -p web`. ADR-008 records why component tests use the web preset.
- **The loop fired and worked.** Three previous firings pushed nothing. This one
  reached the repository on the first try, claimed `M0-07`, and pushed three
  times. Whatever Q-004 describes, it did not stop this session — but note that
  this session *did* have `mcp__github__*` tools, which iteration 1 said fired
  sessions do not. So the firing conditions are not identical to the ones that
  failed, and Q-004 should not be closed on this evidence alone.
- **Surprises for the next agent:**
  - **`jest-expo`'s native preset cannot run under Jest 30.** Not "some tests
    fail" — an empty test file fails to load, because Expo's lazy globals
    `require()` inside their getters and Jest 30 forbids module loads outside a
    test body. `jest-expo/web` works. Do not spend an hour on it; read ADR-008.
  - **Do not disable Metro's `disableHierarchicalLookup` under pnpm.** Every
    monorepo guide says to set it, and every one of those guides assumes a
    hoisted `node_modules`. Under pnpm a package in the store finds its own
    dependencies in a *sibling* directory, so disabling the parent walk breaks
    resolution deep inside `expo-font` with a message that looks like a missing
    dependency. `watchFolders` + `nodeModulesPaths` are the parts you do need.
  - **`app.config.ts` is transpiled alone.** It cannot import a sibling `.ts`
    module — the transpiled `require('./src/config/app-name')` finds nothing at
    config-load time. JSON resolves. The app's name, slug and bundle id
    therefore live in `src/config/app-name.json`.
  - **Static web rendering needs `expo-font` as a direct dependency** of the app
    under pnpm, even though nothing in our code imports it:
    `@expo/router-server` reaches for `expo-font/build/server`.
  - **`pnpm test -- <args>` does not pass flags through.** The trailing `--`
    means jest sees a positional, so `pnpm test -- --selectProjects mobile`
    silently becomes a *path* filter matching `apps/mobile`. It looks like it
    worked. Filter by path on purpose, or run `jest` with the flag directly.
  - **`verify` now takes ~85 s**, not the ~60 s `docs/LOOP.md` quotes: the
    PGlite suite ran 74 s here and the web-export test adds ~8 s.
- **Follow-ups filed:** `M0-09` … `M0-13`, all from `/code-review --effort high`
  run over the branch. Two of them are invariant violations rather than
  tidiness, which is why they sit above `M0-08`: `release_pigeon` guards nothing
  about the bird (anyone can release anyone's pigeon, twice, and a delivery
  resurrects a dead one — `PRODUCT.md` §8 forbids resurrection), and
  `bodies_select_recipient` gates on the reaper's status columns rather than on
  `now()`, which is exactly what ADR-002 exists to prevent. The review verified
  both against the real migrations in PGlite. None of it is in this item's
  **Touches**, so none of it was fixed here.

---

## Iteration 2 — 2026-08-20 — M0-09, the release guards

- **Outcome:** done
- **Verify:** typecheck ok · lint ok · 95 tests ok (91 → 95, floor raised) ·
  flight-sim coverage 99.44% statements / 89.65% branches · `gate:roadmap` ok
  (7 done, 15 pending) · `gate:tests` ok
- **CI:** every `verify` workflow run on this branch — 39 of them — completes
  in 2-4 seconds with no runner assigned and a 404 on its logs. That is Q-003's
  never-scheduled shape, not a real failure; confirmed again via
  `list_workflow_jobs` on the latest run before treating anything as red. Not
  my item; carried on to §2 as the protocol says.
- **What landed:** `supabase/migrations/0006_release_guards.sql`, forward-only
  and redefining both `release_pigeon` and `resolve_due_flights` in full.
  `release_pigeon` now locks the pigeon row (`for update`) and rejects a
  release when the bird isn't the sender's, is already `in_flight`, or is
  dead — closing all three defects `M0-09` was filed against, plus the
  concurrent-double-release race the naive version of the fix would still
  have had. `resolve_due_flights`'s `birds` CTE now guards every field it
  writes with `p.is_alive`/`coalesce(p.died_at, …)`/`coalesce(p.death_flight_id,
  …)` — a pigeon already dead when a (now-impossible, but defended anyway)
  flight resolves stays dead, keeps its original death record, and earns no
  flight credit. The already-alive path is unchanged byte-for-byte.
- **Surprises for the next agent:**
  - **`0005` was already taken.** `M0-09`'s own `Touches:` line said
    `supabase/migrations/0005_*.sql`, written before `0005_schedule.sql`
    (the cron schedule) existed. Check `ls supabase/migrations/` before
    trusting a roadmap item's filename guess; this one landed as `0006`.
  - **A per-project `testTimeout` in `jest.config.js` is a silent no-op.**
    `jest-circus` reads `testTimeout` off `globalConfig` only — a value set
    inside one entry of the `projects` array (the `db` project had
    `testTimeout: 60000`, added in bootstrap) is never read. It looked fine
    for months because the `db` project only had one test file, so there was
    never enough real parallel contention to blow past the *actual*,
    unconfigured 5000 ms default. Adding this item's second `db` test file
    was enough contention under full `pnpm run verify` (coverage + 4 projects
    at once) to expose it: two of the four new tests failed on a hook
    timeout, and it was not my new SQL. Moved to the config root; if a `db`
    suite times out again, check that this hasn't drifted back into a
    project entry.
  - **`security-review`'s git-diff assumption doesn't fit this repo's shape.**
    It shells out to `git diff origin/HEAD...`, which fails outright — there
    is no `origin/HEAD` symbolic ref in a fresh checkout here — and even after
    setting one to `origin/main`, `main` is still just the original empty
    commit this branch merged once for a common ancestor, so the "diff" is
    the entire branch's history, not this iteration's change. Don't spend an
    iteration fighting that; review the actual diff by hand instead
    (parameterized SQL only, no new dynamic queries, grants unchanged, guard
    logic strictly tightens authorization) and say so in the journal, which is
    what happened here — no findings.
  - **`select * into v_pigeon from pigeons where id = ... for update; if not
    found then ...`** is the idiomatic plpgsql pattern for "lock this row and
    fail if it doesn't exist" — cleaner than testing the row variable for
    `IS NULL` afterward, and it reads correctly even for a table whose primary
    key is never actually absent in practice.
- **Follow-ups filed:** none new. `M0-10` through `M0-13` remain exactly as
  filed in iteration 1; this item did not touch any of their files.

---

## Iteration 3 — 2026-08-21 — M0-10, visibility gated on `now()`, not the reaper

- **Outcome:** done
- **CI:** 43 `verify` runs on this branch, all completing in 2-4 seconds with
  no runner assigned and a 404 on job logs — confirmed via `list_workflow_jobs`
  on the latest run (`created_at`/`completed_at` two seconds apart). Q-003's
  never-scheduled shape, not a real failure; not my item, carried on to §2.
- **Verify:** typecheck ok · lint ok · 99 tests ok (95 → 99, floor raised) ·
  flight-sim coverage 99.44% statements / 89.65% branches (unchanged — this
  item touches only `supabase/`) · `gate:roadmap` ok (8 done, 14 pending) ·
  `gate:tests` ok
- **What landed:** `supabase/migrations/0007_visibility_ignores_reaper.sql`,
  forward-only. `bodies_select_recipient` (`0003_rls.sql`) checked
  `f.arrives_at <= now()` — correctly time-gated — but *also* checked
  `f.status = 'arrived'` and `f.outcome = 'delivered'`, both of which stay at
  their release-time defaults (`in_flight`/`pending`) until
  `resolve_due_flights` runs. Confirmed the bug directly: a flight rewound
  past `arrives_at` with the reaper never invoked was unreadable to its
  recipient, exactly the "cron outage delays a message" failure ADR-002 exists
  to prevent. The fix adds `flight_delivered_to_recipient(flight_id)`, a
  `SECURITY DEFINER` helper shaped like `is_conversation_member` in
  `0003_rls.sql`, that reads `flight_secrets.planned_outcome` directly — the
  fate decided at release, never touched by the reaper — and redefines the
  policy to gate on it plus `arrives_at`, dropping the status/outcome columns
  from the check entirely. Four new `[M0-10]` tests in
  `supabase/tests/rls/visibility.test.ts` cover landed/doomed/in-flight/
  one-second-before, all without calling `resolve_due_flights`.
- **Surprises for the next agent:**
  - **A `SECURITY DEFINER` function that reads a locked-down vault table
    (`flight_secrets`) must check the caller's identity itself, not rely on
    the one RLS policy that happens to call it.** `/code-review --effort
    high` caught this before it shipped: EXECUTE on a new function defaults
    to `PUBLIC`, and the `authenticated` role needs that grant for the RLS
    policy to even evaluate — so a first draft that only checked the flight
    id would let any authenticated user learn a stranger's flight outcome by
    UUID alone, `select public.flight_delivered_to_recipient('<uuid>')`
    straight from a REST client. The fix folds
    `f.recipient_id = (select auth.uid())` into the function itself, the same
    shape `is_conversation_member` already uses. If you add another
    `SECURITY DEFINER` helper over a RLS-locked table, give it the identity
    check internally — never assume the caller only ever reaches it through
    one intended policy.
  - **`tsc -b`'s very first compile in a fresh container can emit stray
    `.js`/`.d.ts` files next to `apps/mobile`'s TypeScript sources**, because
    its `tsconfig.json` has no `outDir` (unlike `packages/flight-sim`, which
    does, and outputs to a gitignored `dist/`). Those stray files are
    untracked and not gitignored, so `eslint .` picks them up as plain JS and
    fails on `no-undef` for `describe`/`it`/`expect`/`process`. It happened
    once, on the very first `typecheck` after `pnpm install` in this
    iteration's container, and did **not** reproduce on any run after —
    deleting the strays and re-running `typecheck` left the tree clean every
    time. Whatever triggers it is narrow (possibly the `unrs-resolver`
    ignored-build-script warning `pnpm install` printed, or node_modules
    settling mid-first-compile); it is not this item's bug to fix and not
    reliably reproducible, but if `lint` ever fails on phantom `.js` files
    under `apps/mobile`, `rm` them, re-run `typecheck` once, and check
    `git status` before concluding something is actually broken. Filed as
    `M0-14` since `apps/mobile/tsconfig.json` genuinely has no `outDir` and
    that is worth closing regardless of whether the emit is reliably
    triggered.
  - **`security-review`'s git-diff assumption still doesn't fit this repo's
    shape** (see iteration 2's note — no `origin/HEAD`, and `main` is only a
    shared empty-commit ancestor). Reviewed the diff by hand again instead:
    the new function uses only static, parameterized SQL, pins
    `search_path = ''` with fully-qualified names, and — after the fix above —
    cannot leak `flight_secrets` data to a non-recipient even called
    directly. No findings.
- **Follow-ups filed:** `M0-14` (give `apps/mobile/tsconfig.json` an
  `outDir`, closing the stray-emit surface above regardless of trigger
  reliability).

---

## Iteration 4 — 2026-08-21 — M0-11, the loft snap

- **Outcome:** done
- **CI:** latest run on this branch (`aecb0a2`, run 47) has `conclusion:
  "failure"` in the run summary, which looks different from prior iterations'
  "never scheduled" runs — but `get_workflow_job` on it shows `runner_id: 0`,
  empty `runner_name`, `started_at`/`completed_at` four seconds apart. Same
  never-scheduled shape as Q-003, just surfacing a different `conclusion`
  string this time. Not my item; carried on to §2.
- **Verify:** typecheck ok · lint ok · 104 tests ok (99 → 104, floor raised) ·
  flight-sim coverage 99.44% statements / 89.65% branches (unchanged — this
  item touches only `supabase/`) · `gate:roadmap` ok (9 done, 14 pending) ·
  `gate:tests` ok
- **What landed:** `supabase/migrations/0008_loft_snap_fixes.sql`,
  forward-only, redefining `snap_profile_location()` in full. Longitude is now
  wrapped at the antimeridian (`least(abs(dlon), 360 - abs(dlon))`) and scaled
  by `cos(radians(home_lat))` before comparison, closing the antimeridian and
  latitude-weighting defects together — verified against real haversine
  distances in the test comments, not just the raw-degree arithmetic.
  Clearing `home_lat`/`home_lon` now explicitly nulls `city_id`/`city_label`
  in the same early-return branch instead of leaving them stale. A city
  lookup that returns no row now raises (`no city found to snap to`) instead
  of silently writing null coordinates. The function is pinned to
  `search_path = ''` with a fully-qualified `public.cities`, matching the
  pattern `is_conversation_member` and `flight_delivered_to_recipient`
  already use. Five new `[M0-11]` tests in
  `supabase/tests/rls/loft-snap.test.ts` cover all five acceptance criteria;
  confirmed each one fails against the pre-fix function (temporarily moved
  the migration aside and re-ran) before confirming it passes against the fix.
- **Surprises for the next agent:**
  - **`get_workflow_job`'s `conclusion` field is not a reliable signal on its
    own for "did this actually run."** This run said `"failure"` where every
    prior never-scheduled run in this branch's history said something else
    (the journal doesn't record which, but iterations 2 and 3 both treated it
    as distinguishable at a glance). `runner_id: 0` plus an empty
    `runner_name` plus a multi-second `created_at`→`completed_at` gap is the
    actual signal, regardless of what `conclusion` says. Don't trust
    `conclusion` alone to mean the job body ran.
  - **A planar `(dlat)^2 + (dlon·cos(lat))^2` approximation, not full
    haversine, is enough to fix both the antimeridian and latitude bugs at
    once**, and it is what the item's own title ("wrap the antimeridian,
    weight by latitude") implies rather than a request for great-circle math.
    Verified both new fixtures against a real haversine calculation before
    writing the tests, so the expected winners are ground-truth correct, not
    just self-consistent with the approximation.
  - **`security-review`'s git-diff assumption still doesn't fit this repo's
    shape** (third iteration in a row to hit this — see iterations 2 and 3).
    Reviewed `git diff aecb0a2..HEAD -- supabase/migrations/0008_*.sql` by
    hand instead: static/parameterized SQL only, no dynamic queries, no grant
    changes, the raised exception is a static string with no interpolation.
    No findings. If this keeps recurring, it may be worth its own roadmap
    item rather than a fresh journal note every time — noted but not filed,
    since it's tooling-config, not product code, and outside every item's
    `Touches:` so far.
  - **This session's worker process restarted mid-run**, once, while a
    background `pnpm run verify` was in flight. The untracked migration and
    test file survived on disk across the restart (this container's
    filesystem, unlike its context, is not wiped), so nothing was lost — but
    it is a reminder that `docs/LOOP.md`'s "push early and push often" advice
    is not just about permission-classifier denials. Committed and pushed the
    implementation before `verify` had even finished as a result, then
    verified after the fact. Worth keeping as the default order when a
    background command is running.
  - **`/code-review --effort high` found one deferred, non-correctness
    finding**: `cos(radians(new.home_lat))` is recomputed per candidate city
    row inside the `order by` even though it is constant for the whole
    trigger invocation. Harmless while `cities` is empty (`M1-03` hasn't
    seeded it yet), but worth revisiting once that item lands tens of
    thousands of rows — a `with home as (...)` CTE would hoist it out.
    Deferring rather than fixing now since it is not a correctness bug and
    `M1-03` is what will actually make it matter.
- **Follow-ups filed:** none new. `M0-12` through `M0-14` remain exactly as
  filed in iteration 1; this item did not touch any of their files.

---

## Iteration 5 — 2026-08-21 — HARDENING, dead code

- **Outcome:** done
- **CI:** every run on this branch — 53 of them, latest on `203daf0` — completes
  in 3-6 seconds with a single `ubuntu-latest` job whose `created_at` and
  `completed_at` are the same few seconds apart. Confirmed via
  `list_workflow_jobs` on the newest run before treating anything as red.
  Q-003's never-scheduled shape, not a real failure; not this iteration's item.
- **Selection:** `iteration` (5) − `last_hardening_iteration` (0) = 5 ≥ 5, so
  `docs/LOOP.md` §2's override table puts HARDENING ahead of the topmost `todo`
  (`M0-12`), which stays untouched for the next normal iteration.
- **Verify:** typecheck ok · lint ok · 104 tests ok (unchanged — hardening
  removed dead code, not tests) · flight-sim coverage 99.44% statements /
  89.65% branches (unchanged) · `gate:roadmap` ok (10 done, 13 pending) ·
  `gate:tests` ok · `pnpm --filter mobile exec expo export -p web` still
  bundles and exports 3 static routes
- **What landed:** ran `npx knip` (no prior config in the repo) and treated
  every finding as a hypothesis to verify, not a command to obey — this
  codebase has already been burned once by exactly this shape of tool
  (`expo-font` is required for the web export despite no static import
  anywhere; see iteration 2's journal note). For each flagged dependency I
  checked whether any installed package declares it as a peer dependency,
  then emptied `node_modules` and re-ran `pnpm install` + `pnpm run verify` +
  `pnpm --filter mobile exec expo export -p web` with the candidate removed
  before committing to the removal. Confirmed dead and removed:
  `apps/mobile/package.json`'s `expo-status-bar`, `react-native-worklets`,
  `@react-native/metro-config`, `react-test-renderer` (none required by any
  peer dependency of an installed package, and both the full test suite and
  the static web export succeed without them); `APP_SLUG` and `BUNDLE_ID` from
  `apps/mobile/src/config/app-name.ts` (grepped the whole tree — nothing
  outside that file referenced either; `app.config.ts` already reads
  `slug`/`bundleId` straight off the JSON, not through this module, which is
  the whole reason the module is split from the JSON in the first place); and
  `SANTIAGO`/`REYKJAVIK` from `packages/flight-sim/src/__fixtures__/cities.ts`
  (unused fixtures, not referenced by any test). Left three knip findings
  unfixed because they are verified false positives, not dead code: `expo-font`
  (documented necessity, iteration 2), an "unlisted dependency" on
  `expo-updates` in `app.config.ts` that does not appear anywhere in that
  file's actual text (a knip Expo-plugin heuristic with nothing behind it),
  and an "unresolved import" of `apps/mobile/` from the root `jest.config.js`
  (that string is Jest's own `projects` shorthand for "load this package's own
  Jest config," not an import knip's static resolver understands).
  `/code-review --effort high` ran over the diff afterward and found nothing.
- **Surprises for the next agent:**
  - **Treat every `knip` (or similar static-analysis) finding in
    `apps/mobile` as a hypothesis, never a command.** This repo's Expo/Metro/
    pnpm stack already has one documented case (`expo-font`) where a package
    is required at runtime with zero static imports anywhere in the source
    tree, purely because a *different* package (`@expo/router-server`) reaches
    for it by path at bundle time. A tool that only reads imports cannot see
    that relationship. The only trustworthy test is empirical: delete the
    candidate, `rm -rf node_modules`, `pnpm install`, then run both
    `pnpm run verify` and `pnpm --filter mobile exec expo export -p web` before
    believing the removal is safe. Four dependencies passed that test this
    iteration; `expo-font` would not have.
  - **A stray `cd apps/mobile` in one Bash call persists across every later
    call in the same session** (the tool's working directory is not reset per
    command) and silently changes what a directory-relative tool like `knip`
    treats as its project root — its second run from inside `apps/mobile`
    reported different, wrong findings (`@pidge/flight-sim` and `expo-font`
    as "unused" from the app's own `package.json`, which is nonsense) with no
    error to signal the context had shifted. Always `pwd` after any `cd`
    inside a multi-step investigation, or just avoid `cd` and prefix the one
    command that needs a different directory with `cd x && `.
  - **This container has no simulator and no device**, so "verify" for a
    native dependency removal is necessarily bounded to what `verify` and the
    web export can see. `react-native-worklets` in particular is the kind of
    package that could matter only on-device (native gesture/animation
    worklets) — checked for a peer-dependency requirement from every currently
    installed package and found none, but flag this if an iOS/Android build
    ever exists to test against and something animation-related breaks.
- **Follow-ups filed:** none. This was pure removal within `M0-14`'s and
  `M0-07`'s existing `Touches:` surface; no new roadmap item needed.

---

## Iteration 6 — 2026-08-22 — M0-12

- **Outcome:** done
- **CI:** the newest runs on this branch (run 55/56/57, `sha 12617be`) all
  complete in 2-6 seconds on a single `ubuntu-latest` job — confirmed via
  `list_workflow_jobs` that `created_at`→`completed_at` is a 2-second gap, the
  same never-scheduled shape Q-003 already documents. Not this iteration's
  item; carried straight to §2.
- **Selection:** `iteration` (6) − `last_hardening_iteration` (5) = 1 < 5, and
  `iteration` (6) − `last_audit_iteration` (0) = 6 < 10, so neither override
  applies. Topmost `todo` with satisfied dependencies is `M0-12` (depends on
  `M0-02`, done). Size `S`.
- **Verify:** typecheck ok · lint ok · 108 tests ok (104 → 108, floor raised) ·
  flight-sim coverage 99.48% statements / 91.07% branches · `gate:roadmap` ok
  (11 done, 12 pending) · `gate:tests` ok
- **What landed:** `splitAtAntimeridian` used to discard any segment with only
  one point, which silently dropped the origin whenever the very first
  densified sample already crossed ±180 (a route whose origin sits within one
  sample-step of the seam). The acceptance criteria required both "keeps the
  origin" and "every segment has >= 2 points" simultaneously, which rules out
  just relaxing the filter — a lone-point origin segment can't satisfy the
  second criterion on its own. Fixed by inserting an interpolated boundary
  point at the exact seam (lon = ±180) on both sides of a crossing, linearly
  interpolating latitude between the two straddling samples: this gives the
  origin's segment a genuine second point (the boundary) instead of leaving it
  alone, keeps every segment's internal longitude jump ≤ 180° (so the existing
  `M0-02` invariant test still holds), and keeps the sum-of-segments distance
  within tolerance since the inserted point sits on the already-densely-sampled
  path. Three new `[M0-12]` tests cover the three acceptance criteria directly,
  using a fixture (`lat: -18.2, lon: 179.9` → `lat: -17.7, lon: -177.0`) whose
  very first `densify` sample crosses the seam — confirmed this fixture
  reproduced the origin-drop against the pre-fix code before writing the fix.
  `/code-review --effort high` caught a real bug in the first draft: when two
  adjacent samples already sit on exactly opposite sides of the seam (e.g. lon
  180 followed by lon -180 — reachable because `interpolate()`'s `atan2` can
  legitimately emit exactly ±180), the boundary-interpolation fraction divides
  by a denominator of 0 and produces `NaN`, which then gets written silently
  into both split segments — reproduced directly with a standalone repro
  before fixing. Fixed with an epsilon-guarded fallback (denominator ~0 → use
  `prev`'s own latitude, since there's no real longitude gap left to
  interpolate across) and added a fourth `[M0-12]` regression test for exactly
  that input. The review's second finding — the trailing
  `segments.filter((s) => s.length > 1)` is now dead weight for every
  multi-point input, since the new loop already guarantees >= 2 points per
  segment and the filter only still matters for the degenerate
  `points.length === 1` case — was a style note, not a correctness bug;
  addressed with a one-line comment rather than deferred, since it was
  low-risk and already in hand.
- **Surprises for the next agent:**
  - **A criterion pair like "keep X" + "every segment has >= N points" can
    rule out the obvious fix (just relax a filter) and force a structurally
    different one** (inserting a synthetic boundary point) — read both
    criteria together before picking an approach, not one at a time.
  - **`interpolate()`'s `atan2`-based output can legitimately land exactly on
    ±180**, which is an input `splitAtAntimeridian` (a public, boundary-facing
    function) must not choke on even though it's astronomically unlikely along
    a real great-circle sample sequence — adversarial/synthetic point arrays
    can hit it directly, and code review found it precisely by trying that
    input rather than only auditing the "normal" path.
  - **The M0-02 "leaves no segment containing a longitude jump over 180
    degrees" test doubles as a correctness net for any future change to
    `splitAtAntimeridian`** — the boundary-point insertion here had to keep
    every intra-segment jump ≤ 180° exactly, or that pre-existing test would
    have caught the regression immediately. Worth deliberately re-running
    tests named for an *earlier* item after touching a function they cover,
    not just the tests for the item you're working on.
- **Follow-ups filed:** none. This landed entirely within `M0-12`'s own
  `Touches:` (`packages/flight-sim/src/geo.ts`, `geo.test.ts`); no drift into
  other files.

---

## Iteration 7 — 2026-08-22 — M0-13

- **Outcome:** done
- **CI:** the newest run on this branch (run 61, `sha 21044de`) completed in 3
  seconds on a single `ubuntu-latest` job — confirmed via `list_workflow_jobs`
  that `created_at`→`completed_at` is a 3-second gap with no real step output,
  the same never-scheduled shape Q-003 already documents. Not this iteration's
  item; carried straight to §2.
- **Selection:** `iteration` (7) − `last_hardening_iteration` (5) = 2 < 5, and
  `iteration` (7) − `last_audit_iteration` (0) = 7 < 10, so neither override
  applies. Topmost `todo` with satisfied dependencies is `M0-13` (depends on
  `M0-06`, done). Size `S`.
- **Verify:** typecheck ok · lint ok · 112 tests ok (108 → 112, floor raised
  twice — 111 after the first fix, 112 after the code-review follow-up) ·
  flight-sim coverage 99.48% statements / 91.07% branches (unchanged) ·
  `gate:roadmap` ok (11 done, 12 pending) · `gate:tests` ok
- **What landed:** `check-roadmap-tests.mjs` used to count `[ID]` as a raw
  substring anywhere in a test file's text, so a comment mentioning an item
  satisfied "no checkbox without a test" — confirmed directly by writing a
  fixture where the only mention of the tag was a comment and observing the
  pre-fix gate accept it. Replaced the whole-file substring scan with a regex
  that extracts only the string literal passed to a genuine `it(`/`test(` call
  and searches inside those extracted names instead of the raw source. Three
  new `[M0-13]` tests cover the three acceptance criteria directly, each
  spawning the real gate script (`node scripts/check-roadmap-tests.mjs`) as a
  subprocess against a throwaway fixture tree via a new `ROADMAP_GATE_ROOT`
  env override — chosen over unit-testing an extracted function because the
  script's module system is plain ESM (`.mjs`, no `type: module` in
  `package.json`) while every test file compiles through `ts-jest` targeting
  CommonJS, so a `require()`-based import would not reliably load it.
  Confirmed the comment-only fixture test fails against the pre-fix script
  (stashed the fix, re-ran, watched it fail with the exact assertion error)
  before trusting it as a real regression test, not a self-consistent one.
  `/code-review --effort high` found the first draft's extraction regex
  (`\b(?:it|test)\s*\(`) would also match the string argument of an unrelated
  `.test()` call — e.g. `emailRegex.test('[M2-01] not-an-email')` inside a
  correctly-named `it(...)` — because a word boundary sits on both sides of
  `test` in `.test(` too. That is the exact failure mode this item exists to
  close, just reached through a different vector than a comment, so it was a
  correctness bug worth fixing rather than deferring: anchored the regex to
  the start of a (trimmed) line, matching the convention `gate:tests`' own
  test-count regex already uses, which naturally excludes any `.method(` call
  since the line's first non-whitespace character is `.`, not the method
  name. Added a fourth `[M0-13]` regression test for exactly that input.
  Confirmed on the real repository tree (no `ROADMAP_GATE_ROOT` override) that
  the gate still reports `gate:roadmap ok` after both changes.
- **Surprises for the next agent:**
  - **This repo's `.mjs` scripts and its `.test.ts` files live in
    incompatible module worlds** — the scripts are plain ESM with no
    transpilation, the tests compile through `ts-jest` with `module:
    CommonJS` — so testing a script's behavior means spawning it as a real
    subprocess against a fixture tree, not importing its internals. Added a
    single `ROADMAP_GATE_ROOT` env-var override to `check-roadmap-tests.mjs`
    for exactly this purpose; the same pattern would work for
    `check-test-count.mjs` if it ever needs direct tests.
  - **The line-start anchoring fix has the same known gap as
    `check-test-count.mjs`'s own test-count regex**: neither matches
    `fit(`, `xit(`, `it.each(`, or `test.each(`. `gate:tests` bans `it.skip`/
    `it.only`/`xit`/`xdescribe` outright, which covers most of that gap, but
    `it.each`/`test.each` (parameterized tests) are legal and currently
    unused anywhere in this repo — grepped to confirm. Left unfixed as
    out-of-scope for a Size-S item with nothing in the codebase yet exercising
    it; worth a fresh roadmap item if a future item actually reaches for
    `it.each`.
  - **A subprocess that intentionally exits non-zero inside a Jest test
    prints its own `console.error` output directly into the surrounding
    `pnpm run verify` log**, interleaved with unrelated suites' `PASS` lines,
    even though `execFileSync` captures its stdout/stderr into the returned/
    thrown value. Harmless — the assertions still pass on the captured
    string — but it looks alarming in a raw log scroll if you are not
    expecting it; do not mistake it for a real `gate:roadmap` failure in
    `verify`'s own final line.
- **Follow-ups filed:** none new. This landed entirely within the item's own
  `Touches:` (`scripts/check-roadmap-tests.mjs`,
  `tests/check-roadmap-tests.test.ts`); no drift into other files.

---

## Iteration 8 — 2026-08-23 — M0-14

- **Outcome:** done
- **CI:** `mcp__github__*` tools were not available this session; skipped
  straight to §2 per `docs/LOOP.md` §1.
- **Selection:** `iteration` (8) − `last_hardening_iteration` (5) = 3 < 5, and
  `iteration` (8) − `last_audit_iteration` (0) = 8 < 10, so neither override
  applies. Topmost `todo` with satisfied dependencies is `M0-14` (depends on
  `M0-07`, done). Size `S`.
- **Verify:** typecheck ok · lint ok · 115 tests ok (112 → 115) · flight-sim
  coverage 99.48% statements / 91.07% branches (unchanged) · `gate:roadmap` ok
  (12 done, 11 pending) · `gate:tests` ok
- **What landed:** `apps/mobile/tsconfig.json` gained `"outDir": "./.tsc-out"`.
  Reproduced the item's own history first: added `"src/**/*.json"` to `include`
  (needed regardless — `resolveJsonModule` was on but the JSON import in
  `src/config/app-name.ts` wasn't in any include pattern, which only surfaces as
  `TS6307` once a composite project actually needs to emit, i.e. only once
  `outDir` exists — confirmed by adding bare `outDir` first and watching a clean
  build fail with exactly that error), then confirmed with `tsc -b --noEmit
  false` (forcing emission past the `noEmit: true` inherited from
  `expo/tsconfig.base`, which is what normally suppresses it) that the pre-fix
  config really does spill `.js`/`.d.ts` next to every `apps/mobile` source
  file, and the post-fix config routes all of it under `.tsc-out` instead.
  Three new `[M0-14]` tests: the `outDir` is declared outside `app/`/`src/`,
  it does not collide with `apps/mobile/dist` (see below), and a forced-emit
  build lands everything under `.tsc-out` with nothing beside the sources.
  `/code-review --effort high` caught two things before this was safe to land:
  first, my initial choice of `outDir: "./dist"` collides with `apps/mobile/dist`
  — `expo export -p web` (M0-07) always writes there, and
  `tests/web-export.test.ts` deletes and repopulates that exact directory, so
  running both build paths would race non-deterministically; renamed to
  `./.tsc-out` and added it to `.gitignore` (the generic `dist/`/`build/`
  patterns don't cover a dotdir name). Second, the review ran a plain `tsc -b`
  with `outDir` removed against my first test and it still passed, because
  ordinary `tsc -b` never emits here at all (`noEmit: true` wins) — the
  dynamic test was vacuous. Rewrote it to force real emission with
  `--noEmit false`, which does discriminate: confirmed it fails, with stray
  files under `app/` and `src/`, against the tsconfig from before this fix.
- **Surprises for the next agent:**
  - **`apps/mobile`'s `tsc -b` never actually emits anything under normal
    `pnpm run typecheck`** — `noEmit: true` from `expo/tsconfig.base` wins over
    `composite: true` in every build I could produce. The stray-file bug this
    item exists for could not be reproduced through the front door at all; the
    only way to exercise it directly is `tsc -b --noEmit false`, which
    overrides the config on the command line. Whatever triggered the original
    one-time reproduction (this item's own history names the `unrs-resolver`
    ignored-build-script warning as a suspect) is still unexplained — this fix
    is defense in depth for a bug whose real trigger nobody has caught twice.
  - **Never default a new build-output directory to `dist` in this repo**
    without checking `apps/mobile/dist` first — it is not a generic scratch
    name here, it is `expo export -p web`'s one fixed output path, owned and
    actively raced by `tests/web-export.test.ts`. Any future composite project
    or build script reaching for `./dist` in `apps/mobile` needs a different
    name.
  - **A dynamic test that "proves" a fix by running the real command with
    default flags can pass for the wrong reason** — here, because the
    surrounding config (`noEmit: true`) already suppressed the exact failure
    mode being tested, independent of the fix. Forcing the failure condition
    directly (`--noEmit false`) rather than trusting the default invocation was
    the only way to get a test that actually discriminates fixed from unfixed.
- **Follow-ups filed:** none. This landed inside the item's own intent even
  though the file list grew: `Touches:` originally listed only
  `apps/mobile/tsconfig.json` and `.gitignore`, but the acceptance criteria
  ("produces no `.js`/`.d.ts`") required a test proving it, so
  `tests/mobile-tsconfig-outdir.test.ts` was added and the `Touches:` line
  updated to match, the same way `M0-13` and earlier items list their own test
  file.

---

## Iteration 9 — 2026-08-23 — M0-08

- **Outcome:** done
- **CI:** run 69 on `5b65ac4` (this branch's tip at claim time) completed in
  4 seconds with `runner_id: 0`, an empty `runner_name`, and a 404 on
  `get_job_logs` — the same never-scheduled shape Q-003 already documents, not
  a real failure. Not this iteration's item; carried straight to §2.
- **Selection:** `iteration` (9) − `last_hardening_iteration` (5) = 4 < 5, and
  `iteration` (9) − `last_audit_iteration` (0) = 9 < 10, so neither override
  applies. Topmost `todo` with satisfied dependencies is `M0-08` (depends on
  `M0-07`, done). Size `M`.
- **Verify:** typecheck ok · lint ok · 119 tests ok (115 → 119) · flight-sim
  coverage 99.48% statements / 91.07% branches (unchanged) · `gate:roadmap` ok
  (14 done, 9 pending) · `gate:tests` ok
- **What landed:** `pnpm run shot -- <story>` (`scripts/shot.mjs`), which boots
  the Expo web dev server, drives a headless Chromium (`playwright`, new
  devDependency, ADR-009) to `/_dev/<story>?t=<epoch_ms>`, waits for
  `data-testid="ready"`, and writes `artifacts/shots/<story>.png`. The one
  story so far (`index`, in `apps/mobile/app/_dev/[story].tsx`) just proves the
  mechanism — it renders the same app name the real index route does. Four new
  `[M0-08]` tests cover the acceptance criteria directly by shelling out to the
  real CLI commands, the same shape M0-07's `web-export.test.ts` already used.
  `expo export -p web` turned out to bundle `_dev` into the production output
  even with no `generateStaticParams` on it (confirmed directly: an
  unmodified export produced `dist/_dev/[story].html`), so
  `apps/mobile/scripts/export-web.mjs` now wraps the real command, physically
  moving `app/_dev` out of `app/` for the span of the export and back
  afterwards in a `finally`; `export:web` calls it instead of the raw command
  now, and `M0-07`'s `Verify with` line was updated so a future manual
  re-verify doesn't bypass it. `/code-review --effort high` (three rounds)
  found real bugs, not style nits: `@react-native/dev-middleware` refuses to
  launch its debugger tooling under `NODE_ENV=test` unless mocked, which
  crashed the dev server the instant this ran inside Jest (fixed by forcing
  `NODE_ENV=development` on the spawned child only); `pnpm run shot -- index`
  forwards the literal `--` token to the script instead of stripping it the
  way `npm run` does (confirmed side by side against both package managers
  with an identical script) — `shot.mjs`'s arg parsing now filters it out;
  and, most substantially, a live Metro dev server and a full production
  `expo export` genuinely starve each other for CPU when Jest schedules both
  test files' heavy work at the same moment — forcing `shot.test.ts` and
  `web-export.test.ts` onto two workers reproduced a `[data-testid="ready"]`
  timeout on every attempt, three times running, until both scripts were made
  to share one cross-process `mkdir`-based lock (`scripts/lib/file-lock.mjs`).
  Later rounds also caught: an uncaught `spawn` error crashing the whole
  process instead of surfacing through the diagnostic error path; a typo'd
  story name silently "succeeding" by matching `testID="ready"` on its own
  unknown-story fallback UI (now a distinct `testID="story-not-found"` that
  `shot.mjs` races against, so a bad name fails fast with a clear message
  instead of a slow, misleading pass or a 60-second timeout); a crash-recovery
  gap where a hard-killed run could leave both the real `app/_dev` and a
  stale parked copy on disk, which would throw `ENOTEMPTY` on the next run's
  rename; and a missing explicit timeout on `page.goto` (Playwright's 30s
  default doesn't budget for Metro compiling the route's bundle on that exact
  request, which is the real work being waited on).
- **Surprises for the next agent:**
  - **A live Metro dev server and a full `expo export -p web` will starve
    each other for CPU if Jest ever runs them at the same moment**, and Jest's
    default scheduling does not prevent that — it happened to avoid it in the
    full 13-suite `pnpm run verify` run but reproduced on every attempt when
    only these two heavy test files ran together (fewer other suites to
    interleave the scheduling). `scripts/lib/file-lock.mjs`'s cross-process
    lock is the fix; any future script that boots Metro (dev server or
    export) in a test should acquire the same lock (`metroCpuLockPath`)
    rather than trusting scheduling luck.
  - **pnpm does not strip a `--` argument separator the way npm does.**
    `pnpm run <script> -- <args>` forwards the literal `--` through to the
    underlying command as an extra argv entry; `npm run <script> -- <args>`
    does not. Confirmed side by side with an identical trivial script. Any
    future script invoked as `pnpm run x -- y` needs to filter stray `--`
    tokens out of its own argv, the way `shot.mjs` now does.
  - **`@react-native/dev-middleware` hard-refuses its debugger-launch paths
    under `NODE_ENV=test`** ("must be mocked or overridden in tests"),
    unconditionally, with no way to opt out from the caller's side except not
    being `NODE_ENV=test` — which a script spawned from inside a Jest test
    inherits by default. Any future dev-server-booting script spawned from a
    test needs to force `NODE_ENV` to something else on the child.
  - **`output: 'static'` (app.config.ts, set since `M0-07`) does not exclude a
    dynamic route from `expo export` just because it has no
    `generateStaticParams`** — it still gets a page in `dist/`. Whatever ends
    up being this repo's next dev-only or internal-only route will hit the
    same leak `_dev` did; reach for `export-web.mjs`'s park/restore pattern
    (or generalize it) rather than assuming the framework excludes it.
  - **Deferred, not fixed:** `withFileLock`'s poll loop
    (`scripts/lib/file-lock.mjs`) and `waitForServer`'s poll loop
    (`scripts/shot.mjs`) duplicate the same deadline/sleep/retry shape with no
    shared helper — `/code-review` flagged this as a style/maintenance nit
    (a future timeout-semantics fix would need to touch both), not a
    correctness bug, so it was left as is rather than adding an abstraction
    for two call sites with slightly different failure semantics.
- **Follow-ups filed:** none new. Everything above landed inside this item's
  own intent; see the updated `Touches:` list on `M0-08` itself for the full
  file set, which grew well past its original guess (as most items' does) once
  the export leak and the concurrency race were discovered mid-implementation.

---

## Iteration 10 — 2026-08-24 — HARDENING

- **Outcome:** done
- **CI:** the previous commit's runs (69–75) all completed in 3–4 seconds with
  no runner assigned — the same never-scheduled shape Q-003 already documents,
  not a real failure. Not this iteration's item.
- **Selection:** both overrides in `docs/LOOP.md` §2's table fired at once —
  `iteration(10) - last_hardening_iteration(5) = 5 >= 5` and
  `iteration(10) - last_audit_iteration(0) = 10 >= 10`. Took the table's first
  matching row, HARDENING, over AUDIT.
- **Verify:** typecheck ok · lint ok · 119 tests ok (unchanged) · flight-sim
  coverage 99.48% statements / 91.07% branches (unchanged, both above
  threshold) · `gate:roadmap` ok (14 done, 9 pending) · `gate:tests` ok
- **What landed:** worked `docs/LOOP.md` §6's checklist top to bottom against
  the diff accumulated since the last hardening pass (`12617be..HEAD`, ~1,166
  lines across M0-08/M0-12/M0-13/M0-14):
  1. Ticked-without-a-test criteria: none — `gate:roadmap` already ok.
  2. Dead code: `npx knip` reported only the three dependencies/imports
     already verified as false positives in iteration 6's HARDEN commit
     (`expo-font`, the phantom `expo-updates` "unlisted dependency", and
     `jest.config.js`'s `apps/mobile/` projects-shorthand). Nothing new.
  3. `/simplify` (4 parallel review agents: reuse, simplification, efficiency,
     altitude) against that diff found two real, low-risk findings and fixed
     both: `packages/flight-sim/src/geo.test.ts` had the same near-seam
     `{ lat: -18.2, lon: 179.9 } / { lat: -17.7, lon: -177.0 }` coordinate pair
     copy-pasted across three `[M0-12]` tests, hoisted to a module-level
     `NEAR_SEAM` constant; `tests/shot.test.ts`'s "byte-identical PNGs" test
     ran the full `pnpm run shot -- index` pipeline a redundant third time
     just to get a "first" buffer to diff, when the preceding test in the same
     file had already produced one — now reuses it, cutting the file from
     three full shot invocations to two.
  4. Coverage: already well above threshold, no action.
  5. `any`/`@ts-ignore`/`TODO`/`FIXME`: grepped the real source tree (not
     `docs/`, which discusses these terms conceptually) — none found.
  6. Dependencies without an ADR: none new; `playwright` has ADR-009,
     `@electric-sql/pglite` has ADR-006, `jest-expo` has ADR-008.
  `/code-review --effort high` on the two touched test files caught a real
  issue in the shot.mjs fix before it landed: reusing the previous test's
  output by re-`readFileSync`-ing `SHOT_PNG` off disk means a pipeline failure
  between that test's `rmSync` and its `runShot()` would leave the file
  missing, and the second test would then throw a confusing `ENOENT` instead
  of surfacing the real failure — and an isolated run of just the second test
  (e.g. `jest -t`) would silently compare against whatever stale PNG happened
  to be on disk. Fixed by threading the buffer through an explicit
  module-scoped variable (`firstRunPng`) set by the first test, with the
  second test throwing a clear, named error if it is unset, instead of
  re-reading the file.
- **Surprises for the next agent:**
  - **Two override conditions in the §2 selection table can both be true on
    the same iteration** (they were here: iteration − last_hardening = 5 and
    iteration − last_audit = 10, both meeting their thresholds on iteration
    10 for the first time). The table doesn't say what to do when more than
    one row matches; this iteration took the first matching row top-to-bottom
    (HARDENING before AUDIT) as the natural reading. Iteration 11 will still
    owe an AUDIT — `last_audit_iteration` is still 0, so `11 - 0 = 11 >= 10`
    stays true regardless of what iteration 11's own item is. Worth a
    clarifying line in `docs/LOOP.md` §2 if this comes up again, but it isn't
    blocking: the loop degrades toward progress either way.
  - **`/simplify`'s own fix can need a second pass through `/code-review`.**
    The shot.mjs reuse fix looked safe on its own terms (Jest's declaration
    order guarantees the file exists) but `/code-review` caught the sharper
    failure-diagnostics problem: *which* file existing wasn't the risk, it was
    what a *failed* first test leaves behind, and what an isolated second-test
    run silently trusts. Re-run `pnpm run verify` and `/code-review` after
    every `/simplify` fix, even ones that look purely mechanical — this repo's
    own §4 already says so, and this iteration is a concrete case of why.
  - **Two `/simplify` "altitude" findings were deferred, not fixed, and are
    worth a future look:** (1) `apps/mobile/scripts/export-web.mjs`'s
    park/restore-`app/_dev`-around-the-export mechanism is a filesystem-level
    workaround for something Metro/Expo's bundler config could exclude more
    directly (e.g. a `resolver.blockList` gated on the export target, or
    keeping story components outside `app/` entirely) — right now it needs a
    cross-process lock and crash-recovery logic just to make a directory
    rename safe. (2) `scripts/lib/file-lock.mjs`'s cross-process mutex exists
    because two Jest test files starved each other for CPU when scheduled
    concurrently, but the fix is wired into two real shipped scripts, so every
    real `expo export -p web` now pays a lock-acquire cost that exists only
    to solve a test-scheduling problem — serializing the two heavy test files
    at the Jest config level (e.g. a slow/integration project with
    `maxWorkers: 1`) would let the lock be removed from production tooling
    entirely. Neither was fixed this iteration: both would change the
    behavior of an already-shipped, well-tested mechanism (M0-08), which is
    more risk than a hardening pass should take on. Also unchanged: the
    already-known duplicate poll-loop shape between `withFileLock` and
    `waitForServer` — this was already found and explicitly deferred in the
    M0-08 journal entry (iteration 9); still true, still not fixed, still not
    a new finding.
- **Follow-ups filed:** none new as roadmap items — the two deferred altitude
  findings above are notes for whenever `M1-05` or a future hardening pass
  next touches `scripts/shot.mjs` / `export-web.mjs`, not standalone items on
  their own yet.
