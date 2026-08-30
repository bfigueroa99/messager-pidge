# Product invariant audit

Overwritten each AUDIT iteration (`docs/LOOP.md` §7). Traces each of
`docs/PRODUCT.md` §3's INV-1…INV-7 to the code that enforces it and the test
that proves it, then checks drift in both directions.

## Audit — iteration 21 — 2026-08-30

| Invariant | Enforced in | Test | Verdict |
|---|---|---|---|
| INV-1 real time over real distance | `packages/flight-sim/src/speed.ts:46` (`durationMs`), `:34` (`effectiveSpeedKmh`), consumed by `packages/flight-sim/src/plan.ts:22` (`planFlight`) — the release Edge Function's own `ReleaseRequestBody` (`supabase/functions/release-pigeon/handler.ts:11`) declares `departsAtMs`/`originLat`/`originLon`/`destLat`/`destLon` fields but its handler never reads them; origin/destination/departure always come from the server's own `getLoft`/`now()` | `packages/flight-sim/src/plan.test.ts:12` "flies LA to NYC in about 22 hours, matching the original" | ok |
| INV-2 loss is real and permanent | `packages/flight-sim/src/hazard.ts:21` (`deathProbability`) rolled once in `plan.ts:53`; body destruction at `supabase/migrations/0004_release_and_reaper.sql:153` (`destroyed as (delete from message_bodies ...)`); a dead pigeon stays dead even under a repeated release attempt (`0006_release_guards.sql:72`, `:76`) | `supabase/tests/rls/visibility.test.ts:81` "the recipient NEVER reads the note of a bird that died", `:93` "the note is hard-deleted, not merely hidden" | ok |
| INV-3 position is derived, never stored per tick | `packages/flight-sim/src/state.ts:19` (`flightStateAt`) — pure function of `(f, nowMs)`, no stored progress field anywhere in the schema; `apps/mobile/src/ui/screens/FlightCard.tsx:45` calls it fresh on every tick, storing only a clock reading (`nowMs`) in React state, never a position | `packages/flight-sim/src/state.test.ts:45` "is a pure function of time — reopening the app never replays a journey" | ok |
| INV-4 fate decided once, at release, deterministically | `plan.ts:53` (`streamFor(input.seed, 'survival')() >= pDeath`) seeded from `input.seed`; `packages/flight-sim/src/rng.ts:38` (`streamFor`); the one real release path draws its seed once (`supabase/functions/release-pigeon/index.ts`'s `randomSeed()`, a single `crypto.getRandomValues` call) and stores it verbatim (`0006_release_guards.sql:32`, `p_seed bigint`, persisted to `flights.seed`) | `packages/flight-sim/src/plan.test.ts:49` "returns deep-equal results for identical inputs", `packages/flight-sim/src/rng.test.ts:48` "is stable for the same seed and stream name" | ok |
| INV-5 outcome is secret until it happens | `supabase/migrations/0007_visibility_ignores_reaper.sql:43` (`bodies_select_recipient` gated on `f.arrives_at <= now()`, superseding `0003_rls.sql:140`); `0003_rls.sql:158` gates `flight_events` the same way; `packages/flight-sim/src/types.ts:49` (`PublicFlight`) is architecturally incapable of carrying outcome data — `FlightSecret` (`:65`) is a separate type, stored in `flight_secrets`, a table with RLS on and zero policies — and the two client screens built since the last audit (`FlightCard`, `LoftPicker`) both consume only `PublicFlight` | `supabase/tests/rls/visibility.test.ts:19` "the recipient CANNOT read the body of a bird still in the air", `:28` "still cannot read it one second before landing" | ok |
| INV-6 the map shows the bird's true position | `state.ts:19` (`flightStateAt`, monotonic in `nowMs`) and `state.ts:66` (`lostStateAt`, pins the death point forever); no chart renders yet (`M1-12`/`M1-13`/`M1-14`, the chart itself, are still `todo`) but the one existing renderer of flight state, `FlightCard`, recomputes from `(flight, nowMs)` on every render with a required `now` prop — never a default, never `Date.now()` | `packages/flight-sim/src/state.test.ts:36` "advances monotonically and never rewinds", `:62` "pins a lost bird where it fell, forever" | ok |
| INV-7 we never store a precise location | `supabase/migrations/0008_loft_snap_fixes.sql:20` (`snap_profile_location` trigger, antimeridian-wrapped and latitude-weighted nearest-city snap), fired by the `before insert or update` trigger declared in `0001_init.sql:69`, unconditionally on every write to `profiles`; `0009_seed_cities.sql` now populates `cities` with 130 real rows (`M1-03`) as the trigger's actual input, and the new `LoftPicker` screen only ever hands the trigger a city's own centroid — never a raw GPS reading — so the snap is enforced twice over (client picks a city; the trigger re-snaps regardless) | `supabase/tests/rls/loft-snap.test.ts:37` "a point just west of the antimeridian keeps its city on the correct side of the seam", `supabase/tests/rls/visibility.test.ts:353` "snaps a precise GPS fix to a city centroid before storing it" | ok |

**All seven invariants: enforced in shipped code, each proved by at least one
test that fails against the pre-fix version (per each item's own journal
entry). No gap found against INV-1…INV-7 directly.** Re-derived independently
of iteration 11's table rather than assumed carried-forward — every cited
line was re-read in the current tree, not copied. Three files shifted lines
since iteration 11 without changing what they enforce: `speed.ts` (`M0-15`'s
own fix moved `effectiveSpeedKmh`/`durationMs` down by 7 lines),
`loft-snap.test.ts` and `visibility.test.ts` (both gained a `delete from
cities` in `beforeEach`, per `M1-03`'s journal entry, moving later tests down
by a handful of lines each).

## Drift check

**Shipped code vs. `PRODUCT.md`:** re-ran the same non-goal grep iteration 11
used (`streak`, `undo`, `unsend`, `retry`, `fast[- ]?path`, `boost`, `priority
send`, `gacha`, `breed`, `rarity`, `leaderboard`, case-insensitive) across
`packages/`, `apps/`, `supabase/` (excluding tests). Same two incidental
prose hits as before — `geo.ts:78`'s "streak" describes a rendering artifact
(a route drawn as a horizontal line across the antimeridian, the thing
`M0-12` exists to prevent), `0005_schedule.sql:7`'s "retry" describes what
Supabase Cron does *not* do — plus one new incidental hit,
`eslint.config.mjs:98`, a comment citing "failed. Retry?" as an example of
copy the voice guard exists to ban, not copy it implements. No non-goal
mechanic implemented anywhere in shipped code.

**`ROADMAP.md` vs. `PRODUCT.md`:** read all nine pending items (`M1-06`
through `M1-09`, `M1-11` through `M1-14`; `M1-05` itself is `split`, not
`todo`, and its three replacements were read in full). Each still cites a
specific `PRODUCT.md` section or invariant in its own "Why," and each item's
"Do NOT" list actively rules out the non-goal closest to its own feature
surface: `M1-06` bans `Date.now()` and animating a landed bird; `M1-07` bans
drafts, a recall affordance, and a double-release; `M1-08` bans revealing
anything to the recipient of a lost message and fast-forwarding a bird that
landed while the app was closed; `M1-09` gates its accelerated clock behind
`EXPO_PUBLIC_E2E`, explicitly not a production fast path; `M1-12`/`M1-13`
explicitly defer the renderer decision and the flown/dashed split to their
own later items rather than scope-creeping them in; `M1-14` bans reading the
ambient clock inside `FlightMap` (progress arrives as a prop, matching
`M1-04`'s own pattern). No item found that `PRODUCT.md` does not justify.

**Shipped-feature spot checks beyond the grep:** `FlightCard` (`M1-04`) and
its literal JSX text was checked directly against the voice guard's intent —
its only non-interpolated JSX text is `"→"` and `"🕊"`, neither of which
contains a letter, and `PRODUCT.md` §5 explicitly reserves the dove glyph for
"exactly one place, the flight card." `M1-10`'s `isFirstEverFlight` mechanism
was checked against §6's "first-ever flight: never dies" canon constant —
`hasEverReleased` counts across a sender's entire flight history (not
per-conversation or per-recipient), matching "first-ever" read literally.

**Verdict: no drift found, either direction.** (Contrast with iteration 11,
which found and filed `M0-15` — that gap was closed in iteration 12 and is
now itself part of the enforced INV table's supporting evidence, not a
finding.)

Set `last_audit_iteration = 21`.
