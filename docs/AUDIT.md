# Product invariant audit

Overwritten each AUDIT iteration (`docs/LOOP.md` §7). Traces each of
`docs/PRODUCT.md` §3's INV-1…INV-7 to the code that enforces it and the test
that proves it, then checks drift in both directions.

## Audit — iteration 41 — 2026-09-09

| Invariant | Enforced in | Test | Verdict |
|---|---|---|---|
| INV-1 real time over real distance | `packages/flight-sim/src/speed.ts:34` (`effectiveSpeedKmh`, wind clamped so nothing raises speed above baseline), `:46` (`durationMs`, clamped to `[MIN_FLIGHT_MS, MAX_FLIGHT_MS]`); `plan.ts:22`/`:32-33` computes duration/arrival once, server-side; `handler.ts:97-160` never reads client-supplied `departsAtMs`/origin/dest, taking origin/destination from `deps.getLoft` and departure from `deps.now()` — unchanged since iteration 31, re-verified directly (`packages/`/`supabase/` diff since then touches only `project.ts`). New consumer since iteration 31: `apps/mobile/src/ui/screens/ComposeScreen.tsx:59-66` (`previewDueIn`) runs the identical `effectiveSpeedKmh`/`durationMs` physics to preview the confirmation's due time, but its own docstring (`:36-42`) and the component's (`:78-82`) are explicit that this preview never reaches `deps.release` and never gates it — the real flight is still rolled server-side at release (ADR-001), confirmed by reading `startRelease` (`:113-126`): it calls `deps.release(note)` directly, never `previewDueIn`'s output | `packages/flight-sim/src/plan.test.ts:12` "[M0-03] flies LA to NYC in about 22 hours, matching the original", `:194`/`:209` "[M0-15] …" | ok |
| INV-2 loss is real and permanent | `packages/flight-sim/src/hazard.ts:21` (`deathProbability`) rolled once in `plan.ts:53`; body destruction at `supabase/migrations/0004_release_and_reaper.sql:153`; a dead pigeon stays dead under a repeated release (`0006_release_guards.sql`). New since iteration 31: the client-side half of "the recipient is never told" is now enforced structurally, not just by RLS — `apps/mobile/src/ui/screens/ArrivalScreen.tsx:57-59` (the recipient's only reveal screen) calls `useResolutionPoll` with an extractor that returns non-null **only** for `outcome === 'delivered'`, so a `'died'` result cannot reach this component's render at all — read the full file, confirmed no branch anywhere references `result.place`/`result.time` or an outcome other than `'delivered'`. `apps/mobile/src/ui/screens/LossScreen.tsx:57-61` (the sender's only loss screen) mirrors this the other way and its memorial branch (`:63-69`) never reads `result.body`, so the destroyed note's text cannot leak through even if a result somehow carried one | `supabase/tests/rls/visibility.test.ts:81`/`:93` "[M0-05] …"; `apps/mobile/src/ui/screens/ArrivalScreen.test.tsx:100` "[M1-21] never reveals anything to the recipient for a flight that resolved as lost"; `apps/mobile/src/ui/screens/LossScreen.test.tsx:115` "[M1-22] the loss screen never shows the note text, even if a result carried one" | ok |
| INV-3 position is derived, never stored per tick | `packages/flight-sim/src/state.ts:19` (`flightStateAt`, pure); `apps/mobile/src/ui/screens/FlightCard.tsx:54`, `FlightScreen.tsx:109` — both unchanged since iteration 31 (confirmed: neither file appears in the `apps/`/`packages/` diff since `4e65cc8`) | `packages/flight-sim/src/state.test.ts:45` "[M0-04] is a pure function of time — reopening the app never replays a journey", `FlightScreen.test.tsx:72` "[M1-16] a flight whose arrival has passed renders as arrived with no replay" | ok |
| INV-4 fate decided once, at release, deterministically | `plan.ts:53` (`streamFor(input.seed, 'survival')() >= pDeath`); `release-pigeon/index.ts:34-40` draws the seed once via `crypto.getRandomValues`, passed through unchanged to `release_pigeon`'s `p_seed` — unchanged since iteration 31 (no `supabase/` diff since then) | `packages/flight-sim/src/plan.test.ts:49` "[M0-03] returns deep-equal results for identical inputs" | ok |
| INV-5 outcome is secret until it happens | Server half unchanged since iteration 31: `supabase/migrations/0007_visibility_ignores_reaper.sql:30-46`/`:48-63` (`arrives_at <= now()`, security definer, reads `flight_secrets` directly); `flight_secrets` has RLS on, zero policies. Client half is new since iteration 31: `apps/mobile/src/data/resolution-deps.ts:20-32` (`ResolutionDeps.poll`) is documented and shaped so it "cannot leak the secret early no matter how often or how eagerly a caller polls it" — `poll` returns `Promise<ResolutionResult | null>`, `null` for anything unresolved; `apps/mobile/src/data/use-resolution-poll.ts:50-78` polls on a 1s interval plus once immediately on mount and only ever calls `setRevealed` when `extract(result)` is non-null, so an unresolved flight can be polled arbitrarily often (or arbitrarily eagerly on mount) without ever producing a non-null render | `apps/mobile/src/data/resolution-deps.test.ts:13` "[M1-20] ten consecutive polls before resolution all return a null body"; `apps/mobile/src/data/use-resolution-poll.test.ts:29` "[M1-20] returns null for ten consecutive polls before resolution" | ok |
| INV-6 the map shows the bird's true position | `state.ts:19`/`:66` (`flightStateAt`/`lostStateAt`); `project.ts:192-203` (`projectPoint`); `FlightScreen.tsx:109`/`:128` (fresh `flightStateAt`/`projectPointWithFit` every render, no cache). **Iteration 31's caveat is now resolved**: `M1-18` and `M1-19` (both `todo` at iteration 31, both `done` now) fixed the two rendering bugs that audit flagged as visual-only. Re-verified directly by reading the current `FlightMap.tsx` in full: the route `<Polyline>`s carry `vectorEffect="non-scaling-stroke"` (`:106`) and the marker's radius is `unscaledRadius(MARKER_RADIUS, displayZoom)` (`:296`, math extracted to `packages/flight-sim/src/project.ts:314-316` per `CLAUDE.md`'s layering rule) so neither balloons at high pinch-zoom; a `restingViewRef` (`:177-188`) resets `pan`/`zoom` to the fit-to-bounds resting view whenever `segments`/`viewport` genuinely change, and also nulls `gestureStartRef` so a gesture already in flight at that moment can't re-apply its stale pre-change offset (`:169-176`). Confirmed none of this touches `flightStateAt`/`projectPoint`'s own computation — `zoom`/`pan` are pure viewport state, grepped every use in the file, neither reaches the model | `state.test.ts:36`/`:62` "[M0-04] …"; `FlightMap.test.tsx:255` "[M1-18] at the route's own maxZoom, the marker's on-screen radius stays within a small, fixed factor of its unzoomed radius"; `:282` "[M1-18] … the route line's on-screen width stays within a small, fixed factor of its unzoomed width"; `:356` "[M1-19] a viewport change … leaves the route framed within the new viewport's bounds, not shifted off it"; `:432` "[M1-19] a route/viewport change mid-gesture does not let the still-active gesture re-apply its stale pre-change offset on its next move" | **ok — caveat from iteration 31 resolved** |
| INV-7 we never store a precise location | `supabase/migrations/0008_loft_snap_fixes.sql:20-66` (`snap_profile_location` trigger); `0009_seed_cities.sql` — unchanged since iteration 31. UI-layer enforcement re-verified at current line numbers: `project.ts:260-268` (`maxZoomForMinVisibleKm`, docstring `:238-259` ties it explicitly to PRODUCT.md §9), wired via `FlightScreen.tsx:129-132` (`MIN_VISIBLE_KM = 25`), clamped in `FlightMap.tsx:194` (`displayZoom = clamp(zoom, MIN_ZOOM, maxZoom)`) — the `M1-19` reconciliation added since iteration 31 resets `zoom` to `MIN_ZOOM` on a route/viewport change but never changes `maxZoom` itself or how it is derived, so the 25 km floor is untouched by this iteration's new code | `supabase/tests/rls/loft-snap.test.ts:37` "[M0-11] …"; `project.test.ts:254` "[M1-17] at the returned maximum zoom, a LA to NYC route's narrower visible dimension is exactly minVisibleKm" | ok |

**All seven invariants: enforced in shipped code, each proved by at least one
test.** Re-derived independently of iteration 31's table — every citation
above was re-read directly from the current tree (HEAD `1194a5e`, plus this
iteration's own `AUDIT: claim` commit), not copied forward. `packages/` and
`supabase/` changed only by one file (`project.ts`, +`unscaledRadius`/
+`REST_ZOOM`) since iteration 31 — every INV-1..INV-5 citation into those
trees was spot-checked against the diff and found unchanged; INV-6/INV-7's
`project.ts` citations were re-read at their current line numbers rather than
assumed stable.

**INV-6 caveat from iteration 31, now closed:** that audit noted `FlightMap`'s
scaled `<G>` group let the marker/route balloon at high pinch-zoom, and a
stale `pan` offset could survive a viewport change — both filed as `M1-18`/
`M1-19`, both visual-only (the underlying `flightStateAt`/`projectPoint`
position was never wrong, only hard to see). Both items shipped since (see
table above) and are directly verified fixed by reading the current
`FlightMap.tsx`. No new caveat found this iteration.

## Drift check

**Shipped code vs. `PRODUCT.md`:** re-ran the same non-goal grep (`streak`,
`undo`, `unsend`, `retry`, `fast[- ]?path`, `boost`, `priority send`, `gacha`,
`breed`, `rarity`, `leaderboard`, case-insensitive) across `packages/`,
`apps/`, `supabase/` (excluding `*.test.*`). Same two incidental prose hits as
every prior audit — `geo.ts:78`'s "streak" (an antimeridian rendering
artifact `arcSegments` prevents), `0005_schedule.sql:7`'s "retry" (describing
what Cron does *not* do). Two new hits since iteration 31, both in
`ComposeScreen.tsx` (`:78-79`): prose stating "There is no recall, cancel,
unsend or edit anywhere in this flow" and "`docs/PRODUCT.md` §8 forbids undo
outright" — read in context, this is the component's own docstring asserting
compliance, not an implementation of the banned mechanic; confirmed directly
against the file that no `recall`/`cancel`/`unsend`/`edit` handler exists
(`ComposeScreen.test.tsx` already static-scans for exactly this, per `M1-07`'s
own resolution note). No non-goal mechanic implemented anywhere in shipped
code.

**Specifically re-checked `M1-07`'s compose/release flow** (new since
iteration 31) against §8's "no fast path" and "no undo": `startRelease`
(`ComposeScreen.tsx:113-126`) makes exactly one call, `deps.release(note)`;
`releasingRef` (a synchronous ref, not state) guards it to fire at most once
per mount; `dismissConfirm` (`:109-111`) only ever returns to the
still-unsent, not-yet-released note — it cannot touch a bird already
released because nothing in this component holds a handle to one. No path
from this screen reaches a released flight's timing or outcome.

**Specifically re-checked `M1-08`'s split** (`M1-20`/`M1-21`/`M1-22`, new
since iteration 31) against INV-2/INV-5/§8: covered in the invariant table
above (INV-2, INV-5 rows). No fast path — `useResolutionPoll` only ever polls
and reveals, it never accelerates, retries-with-backoff-into-success, or
short-circuits an unresolved flight into a resolved one. No undo — there is
no path in either screen back from a revealed state to an unrevealed one
(the only state transition is the one-way `revealed` set inside
`useResolutionPoll`, and it resets only on a genuinely different `flightId`,
per `apps/mobile/src/data/use-resolution-poll.test.ts:108` "[M1-22] resets to
null when reused for a different flightId" — a new mount's own initial
state, not an undo of a real resolution).

**`ROADMAP.md` vs. `PRODUCT.md`:** read every currently pending item in full.
`M1-09` (todo, the demo harness) gates its accelerated `TIME_SCALE` clock
behind `EXPO_PUBLIC_E2E` in its own "Do NOT" line — explicitly not a
production fast path, unchanged since iteration 31. `M1-11` (blocked on
Q-002) still bans stubbing a fake Supabase client that "succeeds" without a
real project, unchanged since iteration 31. `M1-05`, `M1-06`, `M1-08` are
`split`, not `todo`; all three's replacement items are `done` and covered in
the invariant table or the checks above. No pending item describes a
mechanic `PRODUCT.md` does not justify.

**Verdict: no drift found, either direction. One caveat from the prior audit
(INV-6, cosmetic pinch-zoom rendering) is now closed by `M1-18`/`M1-19`.**

Set `last_audit_iteration = 41`.
