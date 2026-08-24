# Product invariant audit

Overwritten each AUDIT iteration (`docs/LOOP.md` §7). Traces each of
`docs/PRODUCT.md` §3's INV-1…INV-7 to the code that enforces it and the test
that proves it, then checks drift in both directions.

## Audit — iteration 11 — 2026-08-24

| Invariant | Enforced in | Test | Verdict |
|---|---|---|---|
| INV-1 real time over real distance | `packages/flight-sim/src/speed.ts:39` (`durationMs`), `:27` (`effectiveSpeedKmh`), consumed by `packages/flight-sim/src/plan.ts:22` (`planFlight`) — no client input reaches either | `packages/flight-sim/src/plan.test.ts:12` "flies LA to NYC in about 22 hours, matching the original" | ok |
| INV-2 loss is real and permanent | `packages/flight-sim/src/hazard.ts:21` (`deathProbability`) rolled once in `plan.ts:53`; body destruction at `supabase/migrations/0004_release_and_reaper.sql:153` (`destroyed as (delete from message_bodies ...)`) | `supabase/tests/rls/visibility.test.ts:81` "the recipient NEVER reads the note of a bird that died", `:93` "the note is hard-deleted, not merely hidden" | ok |
| INV-3 position is derived, never stored per tick | `packages/flight-sim/src/state.ts:19` (`flightStateAt`) — pure function of `(f, nowMs)`, no stored progress field anywhere in the schema | `packages/flight-sim/src/state.test.ts:45` "is a pure function of time — reopening the app never replays a journey" | ok |
| INV-4 fate decided once, at release, deterministically | `plan.ts:53` (`streamFor(input.seed, 'survival')() >= pDeath`) seeded from `input.seed`; `packages/flight-sim/src/rng.ts:38` (`streamFor`) | `packages/flight-sim/src/plan.test.ts:49` "returns deep-equal results for identical inputs", `packages/flight-sim/src/rng.test.ts:48` "is stable for the same seed and stream name" | ok |
| INV-5 outcome is secret until it happens | `supabase/migrations/0007_visibility_ignores_reaper.sql:43` (`bodies_select_recipient` gated on `f.arrives_at <= now()`, superseding `0003_rls.sql:140`); `0003_rls.sql:158` gates `flight_events` the same way | `supabase/tests/rls/visibility.test.ts:19` "the recipient CANNOT read the body of a bird still in the air", `:28` "still cannot read it one second before landing" | ok |
| INV-6 the map shows the bird's true position | `state.ts:19` (`flightStateAt`, monotonic in `nowMs`) and `state.ts:66` (`lostStateAt`, pins the death point forever) | `packages/flight-sim/src/state.test.ts:36` "advances monotonically and never rewinds", `:62` "pins a lost bird where it fell, forever" | ok |
| INV-7 we never store a precise location | `supabase/migrations/0008_loft_snap_fixes.sql:20` (`snap_profile_location` trigger, antimeridian-wrapped and latitude-weighted nearest-city snap) | `supabase/tests/rls/loft-snap.test.ts:29` "a point just west of the antimeridian keeps its city on the correct side of the seam", `supabase/tests/rls/visibility.test.ts:347` "snaps a precise GPS fix to a city centroid before storing it" | ok |

**All seven invariants: enforced in shipped code, each proved by at least one
test that fails against the pre-fix version (per each item's own journal
entry). No gap found against INV-1…INV-7 directly — the one gap this
iteration found is a drift finding against §7's Passage mechanic, not
against a numbered invariant; see below.**

## Drift check

**Shipped code vs. `PRODUCT.md`:** grepped `packages/`, `apps/`, `supabase/`
(excluding tests) for the non-goals in §8 — `streak`, `undo`, `unsend`,
`retry`, `fast[- ]?path`, `boost`, `priority send`, `gacha`, `breed`,
`rarity`, `leaderboard`. Two hits, both incidental prose, not mechanics:
`geo.ts:78` uses "streak" to describe a rendering artifact (a route drawn as
a horizontal line across the antimeridian), and
`0005_schedule.sql:7` uses "retry" to describe what Supabase Cron does
*not* do. No non-goal is implemented.

**GAP found.** `packages/flight-sim/src/speed.ts:27` (`effectiveSpeedKmh`)
models wind and storm effects on cruise speed for §7's "Passage" mechanic.
§7 states plainly: "It adds texture and duration; it never subtracts."
Read as governing the wind mechanic, that rules out a tailwind ever
*shortening* a flight below its unmodified duration. But the actual clamp
math does not enforce that: with `storm = 0` and `fatigue = 1`,
`effectiveSpeedKmh` returns `BASE_SPEED_KMH + wind`, and a tailwind
(`windComponentKmh` up to `+MAX_WIND_COMPONENT_KMH = 25`) pushes the result
*above* `BASE_SPEED_KMH` (177.03 km/h → 202.03 km/h at max tailwind) —
confirmed by reading the clamp bounds in `speed.ts:27-35` directly, not
just by inspection: `plan.test.ts:194`'s own
`[M0-03] slows a bird in a storm and speeds it with a tailwind` test asserts
`tail > calm` as the *intended* behaviour, i.e. the codebase already
encodes the contradiction as a passing test, not merely a latent one. A
weather-driven speedup is not user-initiated, but it is still a way for a
flight to resolve sooner than its unmodified physics allow, which both §7's
"never subtracts" and the "No speed" non-goal (§8: "No boosts... not even
as a joke") rule out. Filed as `M0-15` at the top of `ROADMAP.md`.

**`ROADMAP.md` vs. `PRODUCT.md`:** read all nine pending `M1-*` items
(`M1-01`…`M1-09`). Each cites a specific PRODUCT.md section or invariant in
its own "Why" and none introduces a non-goal — `M1-07`'s acceptance criteria
explicitly bans a recall/cancel/unsend handler, `M1-09`'s `TIME_SCALE` is
gated behind `EXPO_PUBLIC_E2E` and explicitly not a production fast path. No
item found that PRODUCT.md does not justify.

**Verdict: one drift finding (`M0-15`, filed), otherwise no drift.**

Set `last_audit_iteration = 11`.
