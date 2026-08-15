# Decision log (ADR)

Append-only. Newest at the bottom. **Never edit or delete an entry** — supersede
it with a new one.

---

## ADR-001 — Server-authoritative, deterministic flights

- **Date:** 2026-08-15 · **Iteration:** 0 · **Status:** accepted
- **Context:** A flight lasts up to four days. Position must be correct offline,
  mid-flight events must happen at one canonical instant for every observer, and
  the outcome must not be forgeable by a client.
- **Decision:** The server decides everything once, at release: distance,
  duration, arrival, survival, death moment, death location, and cause — all
  rolled from a stored seed. The client is a pure renderer of
  `flightStateAt(publicFlight, now)`. A `pg_cron` job only commits side effects.
- **Consequences:** Position is offline-perfect and costs no polling, no sockets
  and no battery. Cost is O(flights resolving), not O(flights × ticks). An
  offline client cannot learn that its bird died until it reconnects — accepted,
  because the death reveal is a full-screen moment we want the user present for.
- **Rejected:** pure client-side simulation (client picks its own ETA and fate);
  server ticking every flight (100k row updates per tick, and cron downtime
  becomes a correctness bug).

## ADR-002 — Visibility is gated on `now()` in RLS, not on a status flag

- **Date:** 2026-08-15 · **Iteration:** 0 · **Status:** accepted
- **Context:** Supabase Cron does not retry skipped runs and does not alert. If
  readability depended on the reaper having run, an outage would silently hold
  every message hostage.
- **Decision:** `message_bodies` visibility is gated on `f.arrives_at <= now()`
  inside the policy. The reaper owns side effects — push, stats, the loft —
  never visibility.
- **Consequences:** A cron outage delays notifications but never the message. It
  also means the policy is the single source of truth for the core guarantee,
  which is exactly one testable place.

## ADR-003 — `BASE_SPEED_MPH = 110`, and we never display a speed

- **Date:** 2026-08-15 · **Iteration:** 0 · **Status:** accepted
- **Context:** The original advertises 110 mph, and it checks out: LA→NYC is
  3,936 km, which at 110 mph is 22.2 hours, matching the reported 22 hours. A
  real homing pigeon cruises at ~80 km/h, which would make the same flight 49
  hours.
- **Decision:** Keep 110 mph. Never render a speed anywhere in the UI — only ETA
  and distance.
- **Consequences:** Faithful to the original and usable. Because the number is
  never shown, the discrepancy with ornithology is unfalsifiable in-world. The
  realism is spent on where the bird is, not how fast it flaps.

## ADR-004 — Death destroys the payload

- **Date:** 2026-08-15 · **Iteration:** 0 · **Status:** accepted
- **Context:** A lost message must be genuinely gone (`PRODUCT.md` INV-2), and
  undelivered notes are the app's most sensitive stored asset.
- **Decision:** The reaper hard-deletes the `message_bodies` row in the same
  transaction that marks the flight lost. The recipient is never notified that a
  message existed; only the sender is told.
- **Consequences:** The fiction and the data-retention policy are the same rule.
  There is nothing left to leak, and no "recover" affordance is even possible.
- **Alternatives rejected:** tombstoning with a `lost` state (leaves the text on
  disk indefinitely for no product benefit).

## ADR-005 — Constant hazard per kilometre instead of a flat per-flight chance

- **Date:** 2026-08-15 · **Iteration:** 0 · **Status:** accepted
- **Context:** The original uses a flat 0.2% per flight, which makes a message
  across the room exactly as dangerous as crossing the Atlantic.
- **Decision:** `P(death) = 1 - exp(-λ · km)` with
  `λ = 2.002e-6 = -ln(1 - 0.002) / 1000`, capped at 8%.
- **Consequences:** Calibrated to the original at 1,000 km, but now distance is
  what costs you: across town 0.002%, LA→NYC 0.79%, London→Sydney 3.3%. Ambition
  carries risk, which is the correct emotional shape.

## ADR-006 — PGlite for database tests, because Docker is unavailable

- **Date:** 2026-08-15 · **Iteration:** 0 · **Status:** accepted
- **Context:** The build container has the Docker client but no running daemon,
  so `supabase start` cannot work. Without a database, the RLS policies that
  carry the entire product would be untested.
- **Decision:** Run the real migration files against PGlite (Postgres compiled
  to WASM, in-process) with small SQL shims standing in for `auth`, `cron` and
  `realtime`. A native Postgres 16 is also present in this image and works as a
  fallback if PGlite ever falls short.
- **Consequences:** Schema, constraints, triggers, functions and RLS are all
  genuinely tested here. What is *not* covered — real GoTrue auth, Realtime
  authorization, actual pg_cron scheduling — must be validated against a hosted
  dev project, and that gap is stated in the README rather than papered over.

## ADR-007 — Deferred: the map renderer

- **Date:** 2026-08-15 · **Iteration:** 0 · **Status:** proposed
- **Context:** `react-native-maps@1.29` still has only partial Fabric support,
  and Expo SDK 57 dropped the legacy architecture, so there is no fallback.
  `expo-maps` is Expo-authored and New-Architecture-native but has no web
  target — and the web target is the only thing this container can screenshot.
- **Decision (proposed):** `expo-maps` behind a
  `MapCanvas.{ios,android,web}.tsx` renderer split, with MapLibre on web. The
  split is free because `expo-maps` already requires separate iOS and Android
  components.
- **Status note:** to be confirmed or replaced by item `M1-06`, which is the
  first item that actually renders a map. Dashed-polyline support on Apple Maps
  is the specific unknown; `arcSegments()` already returns split segments, so
  dashes can be faked with alternating polylines if needed.
