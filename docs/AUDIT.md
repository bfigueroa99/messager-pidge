# Product invariant audit

Overwritten each AUDIT iteration (`docs/LOOP.md` §7). Traces each of
`docs/PRODUCT.md` §3's INV-1…INV-7 to the code that enforces it and the test
that proves it, then checks drift in both directions.

## Audit — iteration 31 — 2026-09-04

| Invariant | Enforced in | Test | Verdict |
|---|---|---|---|
| INV-1 real time over real distance | `packages/flight-sim/src/speed.ts:34` (`effectiveSpeedKmh`, wind term clamped to `[-MAX_WIND_COMPONENT_KMH, 0]` so nothing raises speed above baseline), `:46` (`durationMs`, clamped to `[MIN_FLIGHT_MS, MAX_FLIGHT_MS]`), consumed by `packages/flight-sim/src/plan.ts:22` (`planFlight`), `:32-33` (`durationMs`/`arrivesAtMs` computed once, server-side) — the release Edge Function's `ReleaseRequestBody` (`supabase/functions/release-pigeon/handler.ts:12-27`) declares optional `departsAtMs`/origin/dest fields but `handleRelease` (`:97-160`) never reads them; origin/destination come from `deps.getLoft` (`:122-123`), departure from `deps.now()` (`:141`), both server-controlled | `packages/flight-sim/src/plan.test.ts:12` "[M0-03] flies LA to NYC in about 22 hours, matching the original", `plan.test.ts:194` "[M0-15] slows a bird in a storm, and a tailwind relieves a headwind without exceeding calm", `:209` "[M0-15] never exceeds the wind-free speed for the same storm and distance" | ok |
| INV-2 loss is real and permanent | `packages/flight-sim/src/hazard.ts:21` (`deathProbability`) rolled once in `plan.ts:53`; body destruction at `supabase/migrations/0004_release_and_reaper.sql:153`; a dead pigeon stays dead under a repeated release attempt (`0006_release_guards.sql:64` row lock, `:72`/`:76` guard raises) | `supabase/tests/rls/visibility.test.ts:81` "[M0-05] the recipient NEVER reads the note of a bird that died", `:93` "[M0-05] the note is hard-deleted, not merely hidden" | ok |
| INV-3 position is derived, never stored per tick | `packages/flight-sim/src/state.ts:19` (`flightStateAt(f, nowMs)`, pure); `apps/mobile/src/ui/screens/FlightCard.tsx:54` (`flightStateAt(flight, nowMs)` — **moved from :45 since iteration 21**, a docstring insertion in iteration 30's `2f2768e` pushed it down, no behavior change), `:39` (`nowMs` state stores only a clock reading); `apps/mobile/src/ui/screens/FlightScreen.tsx:109` (a second, independent `flightStateAt(flight, nowMs)` call site, added by `M1-16`, `now` a required prop never `Date.now()`) | `packages/flight-sim/src/state.test.ts:45` "[M0-04] is a pure function of time — reopening the app never replays a journey", `packages/flight-sim/src/project.test.ts:205` "[M1-15] calling the projector at two different timestamps that are both at or after arrivesAtMs returns the identical pinned destination point", `apps/mobile/src/ui/screens/FlightScreen.test.tsx:72` "[M1-16] a flight whose arrival has passed renders as arrived with no replay" | ok |
| INV-4 fate decided once, at release, deterministically | `plan.ts:53` (`streamFor(input.seed, 'survival')() >= pDeath`); `packages/flight-sim/src/rng.ts:38` (`streamFor`); the one real release path draws its seed once (`supabase/functions/release-pigeon/index.ts:34-40`, a single `crypto.getRandomValues` call), passed through `handler.ts:42`/`:153` to `release_pigeon`'s `p_seed`, stored verbatim per `0006_release_guards.sql` | `packages/flight-sim/src/plan.test.ts:49` "[M0-03] returns deep-equal results for identical inputs", `packages/flight-sim/src/rng.test.ts:48` "[M0-03] is stable for the same seed and stream name" | ok |
| INV-5 outcome is secret until it happens | `supabase/migrations/0007_visibility_ignores_reaper.sql:30-46` (`flight_delivered_to_recipient`, `security definer`, checks `arrives_at <= now()` at `:43`, reads `planned_outcome` from `flight_secrets` directly, never the reaper-set status column), backing `bodies_select_recipient` (`:48-63`, supersedes `0003_rls.sql:129-144`); `0003_rls.sql:154-165` gates `flight_events` the same way (`occurs_at <= now()` at `:158`); `flight_secrets` has RLS on, zero policies (`0003_rls.sql:167-169`); `packages/flight-sim/src/types.ts:49-59` (`PublicFlight`) is architecturally incapable of carrying outcome data, `FlightSecret` (`:65-73`) is a distinct type, and both client screens (`FlightCard.tsx`, `FlightScreen.tsx`) type against `PublicFlight` only | `supabase/tests/rls/visibility.test.ts:19` "[M0-05] the recipient CANNOT read the body of a bird still in the air", `:28` "[M0-05] still cannot read it one second before landing" | ok |
| INV-6 the map shows the bird's true position | `state.ts:19` (`flightStateAt`, monotonic), `:66` (`lostStateAt`, pins the death point forever); `packages/flight-sim/src/project.ts:192-203` (`projectPoint`, its own docstring at `:178-191` states it projects `flightStateAt`'s real geo-space position, never a screen-space length fraction, specifically so the marker cannot decouple from `splitAtProgress`'s pixel-length route split); `apps/mobile/src/ui/screens/FlightScreen.tsx:128` (`projectPointWithFit(state.position, fit)`, `state` from `:109`, computed fresh every render — no stored/cached position, no `Animated`/tween on the marker's own position); `FlightMap.tsx` computes no position itself, only renders the `markerPoint` prop and clamps a pinch/pan viewport transform applied on top of the already-correct point | `packages/flight-sim/src/state.test.ts:36` "[M0-04] advances monotonically and never rewinds", `:62` "[M0-04] pins a lost bird where it fell, forever", `project.test.ts:182` "[M1-15] a bird at 40% of elapsed time on a LA to NYC flight projects within 1% of viewport size of interpolate(...)'s own point", `project.test.ts:205` "[M1-15] ... returns the identical pinned destination point (arrived, no replay, no drift between calls)", `FlightScreen.test.tsx:54` "[M1-16] positions the marker from flightStateAt's real position, projected through the same fit as the route", `:72` "[M1-16] a flight whose arrival has passed renders as arrived with no replay" | ok — see caveat |
| INV-7 we never store a precise location | `supabase/migrations/0008_loft_snap_fixes.sql:20-66` (`snap_profile_location` trigger, antimeridian-wrapped, latitude-weighted nearest-city snap), fired unconditionally on every `profiles` write by the trigger declared in `0001_init.sql`; `0009_seed_cities.sql` populates 130 real cities as the trigger's input; second, UI-layer enforcement added since iteration 21: `project.ts:260-269` (`maxZoomForMinVisibleKm`, docstring at `:244-247` explicitly ties it to PRODUCT.md §9's promise), wired via `FlightScreen.tsx:129-132` (`MIN_VISIBLE_KM = 25`), clamped in `FlightMap.tsx:139` (`displayZoom = clamp(zoom, MIN_ZOOM, maxZoom)`) | `supabase/tests/rls/loft-snap.test.ts:37` "[M0-11] a point just west of the antimeridian keeps its city on the correct side of the seam", `supabase/tests/rls/visibility.test.ts:353` "[M0-05] snaps a precise GPS fix to a city centroid before storing it", `FlightMap.test.tsx:164` "[M1-17] a maxZoom of 1 ... allows no pinch-in at all", `project.test.ts:254` "[M1-17] at the returned maximum zoom, a LA to NYC route's narrower visible dimension is exactly minVisibleKm" | ok |

**All seven invariants: enforced in shipped code, each proved by at least one
test.** Re-derived independently of iteration 21's table — every citation
above was read directly from the current tree (HEAD `2ea2bb5`), not copied
forward. One citation drifted since iteration 21 without changing what it
enforces: `FlightCard.tsx`'s `flightStateAt` call site moved from line 45 to
line 54 (iteration 30's `2f2768e` inserted an 8-line docstring above the
component; no behavior change) — updated above rather than left stale.

**INV-6 caveat, not a violation:** `M1-18` (todo) is a real, pre-existing
rendering bug — `FlightMap.tsx`'s `<G transform="...scale(displayZoom)...">`
(`:239`) wraps both the route `<Polyline>`s and the marker `<Circle>` without
compensating `strokeWidth`/`MARKER_RADIUS` for the scale, so at high
pinch-zoom the marker/line balloon to cover the screen. This is visual-only:
the `markerPoint`/`state.position` the marker is drawn from is still correct
and undecoupled from the model, so INV-6 itself holds — but the bug would
make that compliance hard to *see* on a real device. `M1-19` (todo, stale pan
offset after a viewport change) is likewise UI-only and does not touch how
`flightStateAt`/`projectPoint` compute the bird's position. Both are already
filed with their own acceptance criteria; no new item needed from this audit.

Since iteration 21, `M1-12`–`M1-17` (the chart, its renderer, the flown/
dashed split, the bird's true screen position, the flight screen itself, and
the pinch-to-zoom constraint) all shipped and are now primary enforcement
surface for INV-3/INV-6/INV-7 above — each was independently checked against
its cited invariant, not assumed correct because it merely exists.

## Drift check

**Shipped code vs. `PRODUCT.md`:** re-ran the same non-goal grep (`streak`,
`undo`, `unsend`, `retry`, `fast[- ]?path`, `boost`, `priority send`, `gacha`,
`breed`, `rarity`, `leaderboard`, case-insensitive) across `packages/`,
`apps/`, `supabase/` (excluding tests). Same two incidental prose hits as
iterations 11 and 21 — `geo.ts:78`'s "streak" describes the antimeridian
rendering artifact `arcSegments` exists to prevent, `0005_schedule.sql:7`'s
"retry" describes what Supabase Cron does *not* do. `eslint.config.mjs:98`'s
"failed. Retry?" voice-guard comment (flagged at iteration 21) is unchanged
and outside this grep's scope (root-level, not under the three scanned
directories) — confirmed by direct read it still documents banned copy, not
an implementation of it. No non-goal mechanic implemented anywhere in shipped
code.

**`ROADMAP.md` vs. `PRODUCT.md`:** read all currently pending items in full —
`M1-18`, `M1-19` (both cite their own scoped acceptance criteria and Do-NOT
lists, no mechanic concern), `M1-07` (Do-NOT bans drafts, a recall
affordance, a double-release; enforces §8 "No undo"), `M1-08` (Do-NOT bans
showing the recipient anything for a lost message and fast-forwarding a bird
that landed while closed; enforces INV-2/INV-6), `M1-09` (gates its
accelerated clock behind `EXPO_PUBLIC_E2E`, explicitly not a production fast
path), `M1-11` (blocked on Q-002; Do-NOT bans stubbing a fake client). `M1-05`
and `M1-06` are `split`, not `todo` — their replacements are `done` and
covered above. No pending item describes a mechanic `PRODUCT.md` does not
justify.

**Specific check — `M1-15`/`M1-16`/`M1-17` pinch-zoom/pan code, and
`M1-18`/`M1-19`, for a hidden fast path, undo, or decoupled/replayed
animation** (the three things PRODUCT.md §8 names as what an autonomous
agent most likely drifts toward): read `FlightMap.tsx`, `FlightScreen.tsx`,
`project.ts` in full.

- **No fast path:** `zoom`/`pan` are pure viewport state — grepped both
  screen files for every use; neither ever reaches `flightStateAt`,
  `arcSegments`, or any duration calculation, only the SVG `transform` string
  and the marker's clamp math. `M1-17`'s own Do-NOT ("a zoom/pan gesture must
  never change what `flightStateAt` reports") holds in the code as read.
- **No undo/replay:** no stored "previous" position anywhere.
  `FlightScreen.tsx:73` seeds `nowMs` from `now()` once; every tick re-derives
  fresh, never rewinding. Mounting after `arrivesAtMs` renders arrived on the
  first frame, proved by `FlightScreen.test.tsx:72` and `project.test.ts:205`.
- **No decoupled animation:** the marker's position is
  `projectPointWithFit(state.position, fit)` recomputed every render from
  `flightStateAt`; no `Animated`, spring, or tween of the marker's own
  position anywhere in either file — the 60/sec loop is a sampling rate, not
  an independent model.
- `M1-18`/`M1-19` are cosmetic/gesture-state bugs only — neither alters,
  caches, or replays the bird's actual position; the `flightStateAt`/
  `projectPoint` computation both sit downstream of is unaffected.

**Verdict: no drift found, either direction.**

Set `last_audit_iteration = 31`.
