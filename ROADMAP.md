# Roadmap

Ordered. The loop always takes the **topmost item with status `todo` whose
dependencies are all `done`**. You steer by reordering, editing, or setting an
item to `blocked` — see `docs/LOOP.md` §6 of "how you control it". Never delete a
`done` item; the history is the audit trail.

- **Status:** `todo` · `in-progress` · `blocked` · `done`
- **Size:** `S` (under an hour) · `M` (one session) · `L` (**must be split
  before starting** — splitting is itself a complete iteration)
- Acceptance criteria are written to **be test names**. A criterion may only be
  ticked when a test whose name contains `[ITEM-ID]` covers it; `pnpm run
  gate:roadmap` enforces this.

---

## M0 — Scaffolding

**Goal:** an agent can clone, install, typecheck, lint, test the pure engine,
run the real migrations against a real Postgres, render the app in a headless
browser, and screenshot it — all on Linux, with no macOS and no simulator.

---

### [x] M0-01 — Workspace, toolchain and the purity guard

**Status:** done · **Size:** M · **Depends on:** none

**Why:** Nothing can be verified until `verify` is green. This is the floor the
entire loop stands on.

**Acceptance criteria:**
- [x] flight-sim declares no dependencies of any kind
- [x] no engine source file imports anything at all outside the engine
- [x] no engine source file reads an ambient clock or an unseeded RNG
- [x] TypeScript strict mode is on and unchecked index access is off
- [x] .gitignore covers node_modules, so the Stop hook never jams

**Touches:** `package.json`, `tsconfig.base.json`, `eslint.config.mjs`,
`jest.config.js`, `.gitignore`, `tests/repo-contract.test.ts`

---

### [x] M0-02 — Geodesy: distance, great-circle interpolation, antimeridian

**Status:** done · **Size:** M · **Depends on:** M0-01

**Why:** PRODUCT.md pillar 4 — geography is the mechanic. Every number and every
pixel derives from this file, and it must be correct at the seams.

**Acceptance criteria:**
- [x] measures LA to NYC as 3936 km, within 0.5%
- [x] measures London to Sydney as 16994 km, within 0.5%
- [x] is symmetric and zero for coincident points
- [x] returns the endpoints exactly at f=0 and f=1
- [x] clamps f outside [0,1] rather than extrapolating off the route
- [x] bows north of the chord — a great circle, not a straight line
- [x] returns a finite point for coincident and antipodal endpoints
- [x] densified segment lengths sum to the great-circle distance
- [x] holds the sum-of-segments property over 200 seeded random routes
- [x] gives LA to NYC an initial bearing of ~66 degrees
- [x] always returns a value in [0,360)
- [x] splits a Tokyo to LA route into two drawable segments
- [x] leaves no segment containing a longitude jump over 180 degrees
- [x] returns a single segment for a route that never crosses
- [x] returns nothing for an empty path

**Touches:** `packages/flight-sim/src/geo.ts`, `geo.test.ts`

---

### [x] M0-03 — The planner: seeded fate, speed and hazard

**Status:** done · **Size:** L (split into engine + calibration during bootstrap)
**Depends on:** M0-02

**Why:** INV-1, INV-4 and INV-5. The whole app is a renderer of this function.

**Acceptance criteria:**
- [x] flies LA to NYC in about 22 hours, matching the original
- [x] gives a 1000 km flight the original 0.2% risk
- [x] floors a trivially short hop at the minimum flight time
- [x] keeps even London to Sydney under the seven-day ceiling
- [x] returns deep-equal results for identical inputs
- [x] never reads the ambient clock
- [x] produces different fates for different seeds on the same route
- [x] keeps every hint of the outcome out of the public half
- [x] sets resolveAt to arrival for survivors and to death for the lost
- [x] observed loss over 20000 seeds matches the modelled probability
- [x] rises monotonically with distance
- [x] never exceeds the 8% ceiling, however brutal the route
- [x] never kills a first-ever bird
- [x] reproduces its golden vector for seed 42
- [x] gives each named stream an independent sequence

**Touches:** `packages/flight-sim/src/{plan,hazard,speed,rng,constants}.ts` + tests

---

### [x] M0-04 — Client-side flight state and the canon copy

**Status:** done · **Size:** M · **Depends on:** M0-03

**Why:** INV-3 and INV-6 — position is derived, and reopening the app never
replays a journey.

**Acceptance criteria:**
- [x] sits at the origin before departure
- [x] is at the destination once the arrival time has passed
- [x] is exactly halfway at the halfway point
- [x] advances monotonically and never rewinds
- [x] is a pure function of time — reopening the app never replays a journey
- [x] points the bird along the arc, not straight at the destination
- [x] pins a lost bird where it fell, forever
- [x] matches the original copy for a multi-day flight
- [x] says "arriving" in the final minute
- [x] never shows a percentage or a speed
- [x] renders miles with a thousands separator and no decimals

**Touches:** `packages/flight-sim/src/{state,format}.ts` + tests

---

### [x] M0-05 — Schema, RLS, the release function and the reaper

**Status:** done · **Size:** L (split during bootstrap) · **Depends on:** M0-01

**Why:** INV-2, INV-5, INV-7. This is the product's core guarantee, and if it is
not written before the UI it will never be written.

**Acceptance criteria:**
- [x] the recipient CANNOT read the body of a bird still in the air
- [x] the recipient still cannot read it one second before landing
- [x] the recipient CAN read it once the bird has landed
- [x] the sender can always reread their own note, even mid-flight
- [x] a stranger sees nothing at all
- [x] a signed-out visitor sees nothing at all
- [x] the recipient NEVER reads the note of a bird that died
- [x] the note is hard-deleted, not merely hidden
- [x] the recipient is never told that a lost message existed
- [x] nobody — not even the sender — can select from flight_secrets
- [x] a doomed flight still reads as "pending" while it is in the air
- [x] flight events in the future are invisible to both parties
- [x] is idempotent — running it twice resolves a flight once
- [x] stamps landed_at from the scheduled time, not from when it ran
- [x] an authenticated user cannot forge a flight
- [x] snaps a precise GPS fix to a city centroid before storing it

**Touches:** `supabase/migrations/*.sql`, `supabase/tests/harness.ts`,
`supabase/tests/rls/visibility.test.ts`

---

### [x] M0-06 — Loop machinery and CI

**Status:** done · **Size:** M · **Depends on:** M0-01

**Why:** This is a long autonomous build. Without written canon and mechanical
gates, it drifts into a normal messenger with a bird theme.

**Acceptance criteria:**
- [x] every durable state file exists
- [x] state.json carries a kill switch and a hard budget
- [x] verify runs both gates, so neither can be quietly dropped
- [x] PRODUCT.md still forbids the three things agents drift toward

**Touches:** `docs/*`, `ROADMAP.md`, `CLAUDE.md`, `.loop/state.json`,
`scripts/*.mjs`, `.github/workflows/ci.yml`

---

### [x] M0-07 — Expo app shell

**Status:** done · **Size:** M · **Depends on:** M0-01
**Read first:** `CLAUDE.md`, `docs/PRODUCT.md` §5

**Why:** There is no app yet — only an engine and a database. Everything from
M1 onward renders into this shell. Keep it boring; the interesting parts come
later.

**Do:**
- `apps/mobile` as a pnpm workspace package: Expo SDK 57, React Native 0.86,
  TypeScript strict, `expo-router` v7 file routing.
- `metro.config.js` made monorepo-aware (`watchFolders` + `nodeModulesPaths`) so
  `@pidge/flight-sim` resolves from the workspace root.
- `app.config.ts` (typed, reads env), `.env.example`, `eas.json` with `development`
  / `preview` / `production` profiles.
- `jest-expo` as a fourth Jest project so component tests can run later.
- One route, `app/index.tsx`, rendering the app name and nothing else.
- Add `apps/mobile` to `pnpm-workspace.yaml` and the root `tsconfig.json`
  references.

**Do NOT:**
- Do not add a map library — that is `M1-05`, and the choice is still open
  (ADR-007).
- Do not add navigation beyond the single index route.
- Do not add Supabase client code — that is `M1-02`.
- Do not add any native module that breaks `expo start --web`.

**Acceptance criteria:**
- [x] `pnpm run verify` still exits 0 with the new package in the workspace
- [x] `expo export -p web` produces a bundle without error
- [x] a component test renders the index route and finds the app name
- [x] importing `@pidge/flight-sim` from `apps/mobile` typechecks

**Verify with:** `pnpm run verify && pnpm --filter mobile run export:web` (M0-08
wrapped the raw `expo export -p web` in `apps/mobile/scripts/export-web.mjs` to
keep `app/_dev` out of the production bundle — running the raw command directly
bypasses that and reintroduces the leak `tests/web-export.test.ts`'s `[M0-08]`
test checks for)

**Notes:** Expo SDK 57 is bridgeless-only; there is no legacy architecture to
fall back to. Anything you add must support the New Architecture.

---

### [x] M0-09 — The release function refuses a bird that is not yours, not idle, or dead

**Status:** done · **Size:** M · **Depends on:** M0-05
**Found by:** `/code-review --effort high`, iteration 2 — see `docs/JOURNAL.md`

**Why:** `release_pigeon` currently checks nothing about the bird. Confirmed
against the real migrations in PGlite: one user can release another user's
pigeon, and the same bird can carry two flights at once. The reaper compounds
it — its `birds` CTE rewrites `is_alive`, `died_at` and `death_flight_id`
unconditionally, so delivering a later flight brings a dead bird back to life.
That is `PRODUCT.md` §8 "no resurrect", enforced by nothing.

**Do:** a new forward-only migration adding the guards, and tests for each.

**Do NOT:** edit `0004_release_and_reaper.sql` — migrations are forward-only.

**Acceptance criteria:**
- [x] a user cannot release a bird belonging to someone else
- [x] a bird already in the air cannot be released again
- [x] a dead bird cannot be released
- [x] delivering a flight never resurrects a bird that died on an earlier one

**Touches:** `supabase/migrations/0006_release_guards.sql`,
`supabase/tests/rls/release-guards.test.ts`, `supabase/tests/harness.ts`
(extended to let tests pass a pigeon id and sender/recipient overrides —
needed to construct these scenarios at all; not in the original Touches list,
noted here since 0005 turned out to already be taken by the reaper's cron
schedule), `jest.config.js` (unrelated latent bug this item's second `db` test
file exposed — see the journal).

---

### [x] M0-10 — Message visibility must be gated on `now()`, not on the reaper

**Status:** done · **Size:** S · **Depends on:** M0-05
**Read first:** `docs/DECISIONS.md` ADR-002
**Found by:** `/code-review --effort high`, iteration 2

**Why:** ADR-002 and INV-5 say the body becomes readable when the policy's own
`now()` says the bird has landed, precisely so a cron outage delays a
notification but never a message. `bodies_select_recipient` instead reads the
reaper-set `status`/`outcome` columns. Confirmed: with cron down, a flight that
landed eight hours ago is unreadable. The existing test runs the reaper first,
so it passes without covering the guarantee it claims.

**Acceptance criteria:**
- [x] the recipient can read a landed flight's note with the reaper never run
- [x] a doomed flight's note stays unreadable with the reaper never run
- [x] the in-flight cases still hold with the reaper never run

**Touches:** `supabase/migrations/0007_visibility_ignores_reaper.sql` (the
`Touches:` line's own `0005_*.sql` guess was stale — see `M0-09`'s note, `0005`
was already taken before this item was filed; `0006` was taken too, by this
item's predecessor), `supabase/tests/rls/visibility.test.ts`

---

### [x] M0-11 — The loft snap: wrap the antimeridian, weight by latitude, fail loudly

**Status:** done · **Size:** M · **Depends on:** M0-05
**Read first:** `docs/PRODUCT.md` §9, INV-7
**Found by:** `/code-review --effort high`, iteration 2

**Why:** `snap_profile_location` is the single enforcement point for INV-7 and
it has four defects. It compares raw squared degrees, so it neither wraps at
±180 nor scales longitude by cos(lat): (-18.2, -179.9) snaps to Nuku'alofa,
560 km away in the wrong country, rather than Suva at 175 km. Clearing a loft
returns early and leaves `city_id`/`city_label` stale, so withdrawing your
location still shows correspondents your city. `select … into` with no
`NOT FOUND` guard silently nulls the coordinates if `cities` is empty or
unreadable. And it is the only function here without a pinned `search_path`.

**Acceptance criteria:**
- [x] a point just west of the antimeridian snaps to the city just east of it
- [x] a high-latitude point snaps to the nearest city by ground distance
- [x] clearing the loft clears the city label with it
- [x] the trigger raises rather than nulling a coordinate when no city matches
- [x] the function runs with a pinned search_path

**Touches:** `supabase/migrations/0008_loft_snap_fixes.sql` (the `Touches:`
line's own `0005_*.sql` guess was stale — `0005` was already taken by the
cron schedule; see `M0-09`'s note), `supabase/tests/rls/loft-snap.test.ts`

---

### [x] M0-12 — `arcSegments` must not drop the origin at the antimeridian

**Status:** done · **Size:** S · **Depends on:** M0-02
**Found by:** `/code-review --effort high`, iteration 2

**Why:** `splitAtAntimeridian` discards single-point segments. When the very
first sample crosses ±180 the origin vertex is one of those, so the drawn route
starts 135 km from the loft it left. INV-6 says the chart shows the bird's true
position; that includes where it took off.

**Acceptance criteria:**
- [x] a route starting just west of the antimeridian keeps its origin vertex
- [x] every segment of a split route still contains at least two points
- [x] the sum-of-segments property still holds across the seam

**Touches:** `packages/flight-sim/src/geo.ts`, `geo.test.ts`

---

### [x] M0-13 — The roadmap gate must count test names, not any mention

**Status:** done · **Size:** S · **Depends on:** M0-06
**Found by:** `/code-review --effort high`, iteration 2

**Why:** `check-roadmap-tests.mjs` counts `[ID]` anywhere in a test file's text,
so a comment mentioning an item satisfies "no checkbox without a test". The gate
is the loop's honesty mechanism; a gate that can be satisfied by a comment is
worse than none, because it reads as evidence.

**Acceptance criteria:**
- [x] an ID appearing only in a comment does not count as evidence
- [x] an ID inside an `it()` or `test()` name does count
- [x] the gate still passes on the repository as it stands

**Touches:** `scripts/check-roadmap-tests.mjs`, `tests/check-roadmap-tests.test.ts`

---

### [x] M0-14 — Give `apps/mobile`'s composite project an `outDir`

**Status:** done · **Size:** S · **Depends on:** M0-07
**Found by:** iteration 3, while landing `M0-10`

**Why:** `packages/flight-sim/tsconfig.json` sets `rootDir`/`outDir` so its
compiled output lands in a gitignored `dist/`. `apps/mobile/tsconfig.json` sets
neither, and the root `tsconfig.json` references both projects as composite —
composite projects must emit declarations for other projects to reference.
Observed once, in this iteration's fresh container: the first `tsc -b` after
`pnpm install` emitted `.js`/`.d.ts` files next to every `apps/mobile` source
file (`app.config.ts`, `app/index.tsx`, `src/config/app-name.ts`, the shell
test), untracked and not covered by `.gitignore`, which then failed `eslint .`
with `no-undef` on the plain-JS output. It did not reproduce on any later run
in the same container — the trigger looks narrow (possibly whatever the
`unrs-resolver` ignored-build-script warning left unfinished) — but the missing
`outDir` is real regardless of how reliably it fires, and a `verify` that goes
red on a phantom file with no diff to point at is a bad failure mode for an
unattended loop to hit.

**Acceptance criteria:**
- [x] `apps/mobile/tsconfig.json` has an `outDir` outside the source tree
- [x] `pnpm run typecheck` from a clean `node_modules` produces no `.js`/`.d.ts`
      file under `apps/mobile/app` or `apps/mobile/src`
- [x] `pnpm run verify` still exits 0

**Touches:** `apps/mobile/tsconfig.json`, `.gitignore`, `tests/mobile-tsconfig-outdir.test.ts`

---

### [x] M0-08 — Headless eyes: web preview and screenshots

**Status:** done · **Size:** M · **Depends on:** M0-07
**Read first:** `CLAUDE.md` (the layering rule and why it exists)

**Why:** This container has no simulator. Without a headless render path no
agent can ever confirm that the map looks right — and the map *is* the product.
This item buys sight.

**Do:**
- `react-native-web` configured so `expo start --web` and `expo export -p web`
  both succeed.
- Playwright (chromium only), viewport 393×852, `deviceScaleFactor: 3`.
- `pnpm run shot -- <story>`: boot the web bundle, navigate, wait for a
  `data-testid="ready"` marker, write `artifacts/shots/<story>.png`.
- A story route at `app/_dev/[story].tsx` rendering components in isolation with
  fixed props and a **frozen clock** via a `?t=<epoch_ms>` query parameter.
- `artifacts/` in `.gitignore`.

**Do NOT:**
- Do not add pixel-diff regression testing yet — the UI is still changing shape.
- Do not ship the `_dev` routes in a production bundle.

**Acceptance criteria:**
- [x] `pnpm run shot -- index` writes a non-empty PNG in under 120 seconds
- [x] two consecutive runs with a frozen clock produce byte-identical PNGs
- [x] the exported production web bundle contains no `_dev` route
- [x] chromium installs in CI without an interactive prompt

**Notes:** Freeze the clock via the query parameter *now*. Retrofitting
determinism after the flight screen exists is painful, and every later chart
screenshot depends on it.

**Touches:** `scripts/shot.mjs`, `scripts/lib/file-lock.mjs`,
`apps/mobile/app/_dev/[story].tsx`, `apps/mobile/scripts/export-web.mjs`
(wraps `expo export -p web` — confirmed directly that the raw command still
bundles `_dev` into `dist/` despite it having no `generateStaticParams`),
`apps/mobile/package.json` (`export:web` now calls the wrapper),
`tests/shot.test.ts`, `tests/web-export.test.ts` (extended with the
no-`_dev`-route check — reusing that test's own export instead of running a
second one avoids racing it, see the journal), `package.json` (`shot` script,
`playwright` devDependency), `.gitignore`, `eslint.config.mjs` (globals for
the new scripts), `.github/workflows/ci.yml`, `docs/DECISIONS.md` (ADR-009),
`ROADMAP.md` (M0-07's own `Verify with` line, which the export wrapper made
stale).

---

## M1 — The magic moment

**Goal:** one pigeon, one route, one arrival — and it feels like a real object
moving through the real world.

**Demo:** two browser panes. Pick Los Angeles, pick New York, type a note,
release. The chart draws a dashed great circle and the card reads
`🕊 1d 2h away · 2,446 mi`. With the clock scaled ×1440 the whole 22 hours plays
in 55 seconds, and the second pane says "A pigeon has arrived." Then run it again
with the bird doomed, and watch the note be destroyed while the recipient never
learns it existed.

---

### [ ] M1-01 — Design tokens, typography, and the single strings module

**Status:** todo · **Size:** M · **Depends on:** M0-07
**Read first:** `docs/PRODUCT.md` §5 (the tone-of-voice table)

**Why:** Centralising every user-facing string in one reviewed file is the
mechanical enforcement of pillar 2. An agent cannot accidentally ship "Delivery
failed. Retry?" if strings cannot be written inline.

**Do:**
- `src/ui/theme/tokens.ts`: colours (chart water, land, coastline hairline,
  route dash, bird, paper, ink, alarm), spacing, radii, durations. Dark-first.
- `src/ui/theme/typography.ts`: two families max — a humanist serif for dispatch
  text, a mono for times and distances. Sizes tied to Dynamic Type ratios.
- `src/ui/copy/strings.ts`: a typed, flat, exhaustive catalogue with a
  `t()`-shaped accessor. No runtime i18n dependency.
- A test that fails on a hardcoded alphabetic literal inside a JSX text node
  anywhere under `apps/mobile/src/ui/**` or `apps/mobile/app/**`.

**Do NOT:**
- Do not localise to other languages yet.
- Do not build a component library; build the tokens only.

**Acceptance criteria:**
- [ ] `strings.ts` has a key for every row of the tone-of-voice table
- [ ] a JSX text node with a hardcoded literal fails the lint test
- [ ] no string contains an exclamation point, "failed", "error", "retry" or "sent"
- [ ] every string resolves through the typed accessor without a cast

**Notes:** The third criterion is the voice guard. If a legitimate string needs
one of those words, rewrite the string — do not weaken the test.

---

### [ ] M1-02 — Share the engine with the Edge Function, and release for real

**Status:** todo · **Size:** M · **Depends on:** M0-05
**Read first:** `packages/flight-sim/src/plan.ts`, `supabase/migrations/0004_release_and_reaper.sql`

**Why:** ADR-001. The flight math must have exactly one implementation. The
Edge Function plans the flight; `release_pigeon` writes it down.

**Do:**
- `scripts/build-engine.mjs`: esbuild bundle of `@pidge/flight-sim` to
  `supabase/functions/_shared/flight-sim.js` (ESM, platform-neutral). Commit the
  output.
- A CI step regenerating it and failing on `git diff --exit-code`, so the bundle
  can never drift from the source.
- `supabase/functions/release-pigeon/index.ts`: a thin HTTP adapter that parses
  the request, resolves the recipient's loft coordinates **server-side**, calls
  `planFlight`, and invokes `release_pigeon` with the result.
- A Node test for the handler with a stubbed Supabase client.

**Do NOT:**
- Do not put business logic in the Edge Function — it is an adapter.
- Do not let the client supply the origin, the destination, or the departure
  time. All three are the server's.

**Acceptance criteria:**
- [ ] the bundled engine returns the same arrival time as the Node engine for LA to NYC
- [ ] the handler rejects a body longer than 280 characters before touching the database
- [ ] the handler ignores a client-supplied departure time
- [ ] the handler resolves the destination from the recipient's stored loft, not from the request

---

### [ ] M1-03 — Cities dataset and the loft picker

**Status:** todo · **Size:** M · **Depends on:** M0-07, M1-01
**Read first:** `docs/PRODUCT.md` §9, `supabase/migrations/0001_init.sql`

**Why:** INV-7. Choosing a city is offered *first*, before any location
permission, which makes the app fully testable in CI and fully usable by someone
who will not grant location.

**Do:**
- Bundle a GeoNames subset (cities over 15,000 population, ~1 MB) as a seed
  migration plus a client-side search index.
- A searchable picker screen writing to `profiles.home_lat/home_lon`, which the
  existing database trigger snaps to a centroid.
- Copy in plain English on this screen, per PRODUCT.md §5's consent exception.

**Do NOT:**
- Do not request location permission in this item — that is a later one.
- Do not store anything more precise than what the trigger returns.

**Acceptance criteria:**
- [ ] searching "Los Ang" surfaces Los Angeles within the first three results
- [ ] selecting a city stores the centroid, not the query
- [ ] the picker works with no network and no permissions granted
- [ ] the screen's copy contains no in-fiction language

---

### [ ] M1-04 — The flight card

**Status:** todo · **Size:** S · **Depends on:** M1-01
**Read first:** `packages/flight-sim/src/format.ts`, `docs/PRODUCT.md` §6

**Why:** It is the single most screenshotted element of the original, and it is
pure presentation over an already-tested function.

**Do:** `🕊 1d 2h away` on one line, `2,446 mi` on the next, origin → destination
as place names. Text ticks at 1 Hz so the numbers do not jitter.

**Do NOT:**
- Do not render a percentage, a progress bar, or any speed.
- Do not fetch anything; the card takes props.

**Acceptance criteria:**
- [ ] renders "13h 13m away" and "2,446 mi" at 40% of a LA to NYC flight
- [ ] renders "arriving" in the final minute
- [ ] contains no speed value anywhere in its output
- [ ] updates once per second, not once per frame

---

### [ ] M1-05 — The chart: decide the renderer and draw the route

**Status:** todo · **Size:** L (**split this before starting**)
**Depends on:** M0-08, M0-02
**Read first:** `docs/DECISIONS.md` ADR-007, `packages/flight-sim/src/geo.ts`

**Why:** The map is the product. This is also the item that resolves ADR-007
from "proposed" to "accepted" or replaces it.

**Do:** evaluate `expo-maps` against a bundled-vector-SVG chart on: dashed
polyline support, New Architecture compatibility, web rendering for screenshots,
API keys, and offline behaviour. Record the outcome as an ADR. Then implement
`MapCanvas.{ios,android,web}.tsx` behind one `FlightMap` component, drawing the
route from `arcSegments()` with the flown portion solid and the rest dashed.

**Do NOT:**
- Do not skip the ADR. This decision is expensive to reverse — it touches the
  flight screen, the Atlas and the Columbarium.
- Do not add city labels, roads, or traffic. This is a chart, not Apple Maps.

**Acceptance criteria:**
- [ ] a Tokyo to LA route renders as two polylines with no horizontal streak
- [ ] a LA to NYC route's projected midpoint sits above the chord midpoint
- [ ] the route fits its bounds with the same padding ratio at 5 mi and 10,000 mi
- [ ] two consecutive frozen-clock screenshots are byte-identical

---

### [ ] M1-06 — The flight screen

**Status:** todo · **Size:** L (**split this before starting**)
**Depends on:** M1-04, M1-05

**Why:** This is the screenshot people send their friends. It is the entire
marketing budget.

**Do:** full-bleed chart, the title, the flight card, the bird driven by
`flightStateAt(plan, serverNow())` — a frame loop for the marker, 1 Hz for the
text. Correct on cold start and after backgrounding: recompute from the plan,
never from stored progress. Constrained gestures with max zoom clamped so no
street-level detail is ever reachable.

**Do NOT:**
- Do not implement sending, arrival, or death here.
- Do not call `Date.now()` — use the server-corrected clock.
- Do not animate a bird that has already landed.

**Acceptance criteria:**
- [ ] the bird sits within 1% of the 40% point at 40% of elapsed time
- [ ] advancing the frozen clock one hour moves it ~4.5% further
- [ ] a flight whose arrival has passed renders as arrived with no replay
- [ ] at maximum pinch the visible span is never under 25 km
- [ ] with reduced motion on, the bird still updates at 1 Hz

---

### [ ] M1-07 — Compose and release

**Status:** todo · **Size:** M · **Depends on:** M1-02, M1-03

**Why:** Releasing a bird must feel like a decision, not like hitting send. The
irreversibility is stated up front because that is the deal.

**Do:** a 280-character note field with the counter rendered as ink; a
pre-release confirmation stating the due time and that it cannot be recalled; a
~1.2 s release ceremony; optimistic navigation to the flight screen.

**Do NOT:**
- Do not add drafts, attachments, or a recall affordance.
- Do not let a double-tap release two birds.

**Acceptance criteria:**
- [ ] typing a 281st character is impossible
- [ ] a double-tap on release calls the edge function exactly once
- [ ] a network failure preserves the note text and shows the in-fiction copy
- [ ] no handler named recall, cancel, unsend or edit exists in the flow

---

### [ ] M1-08 — Arrival, and the death that nobody sees

**Status:** todo · **Size:** L (**split this before starting**)
**Depends on:** M1-06, M1-07 · **Blocked by:** Q-002 for the Realtime half

**Why:** The arrival is the payoff for 22 hours of waiting. If it is late,
silent, or ordinary, the product fails.

**Do:** subscribe to flight resolution over Realtime; land the bird on the
chart, resolve the card, then *reveal* the note as a scene rather than pushing a
row into a chat log. On the sender's side, a lost bird gets the memorial copy
from PRODUCT.md §5 — name, place, time, and that the note was not recovered.

**Do NOT:**
- Do not show the recipient anything at all for a lost message.
- Do not fast-forward a bird that landed while the app was closed.

**Acceptance criteria:**
- [ ] the recipient's client reveals the note within 2 seconds of resolution
- [ ] ten consecutive polls before resolution all return a null body
- [ ] a cold start after arrival shows the arrived state with no animation
- [ ] the loss screen names the place and time and never shows the text

---

### [ ] M1-09 — The demo harness

**Status:** todo · **Size:** M · **Depends on:** M1-08

**Why:** A 22-hour flight cannot be tested in real time. This is the
highest-leverage 40 lines in the repo.

**Do:** a `TIME_SCALE` clock (default 1, `epoch + (real - epoch) × scale`) that
every time read in the app goes through; a seeded two-user script; a runner that
plays a full LA→NYC flight in under a minute; a recording checklist.

**Do NOT:**
- Do not let `TIME_SCALE` be settable in a production build. Gate it behind
  `EXPO_PUBLIC_E2E`.

**Acceptance criteria:**
- [ ] with the scale at 1440 a 22-hour flight completes in 55 ± 2 seconds
- [ ] the scale is ignored unless the E2E flag is set
- [ ] the seeded script produces the same fate on every run
