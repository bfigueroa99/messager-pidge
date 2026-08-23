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

## ADR-008 — Component tests run through `jest-expo/web`, not the native preset

- **Date:** 2026-08-20 · **Iteration:** 2 · **Status:** accepted
- **Context:** `jest-expo@57` is built against Jest 29 — it depends on Jest 29's
  `babel-jest`, `jest-snapshot` and `jest-environment-jsdom` — while this repo
  runs Jest 30. Under the native preset every mobile suite fails before a single
  test executes: Expo installs lazy globals (`fetch`,
  `__ExpoImportMetaRegistry`) whose getters `require()` a module, and Jest 30
  refuses to load modules outside a test body ("You are trying to `import` a
  file outside of the scope of the test code"). An empty test file reproduces it.
- **Decision:** the `mobile` Jest project uses `preset: 'jest-expo/web'` — jsdom
  plus `react-native-web` — and components are asserted with
  `@testing-library/react` rather than `@testing-library/react-native`.
- **Consequences:** component tests exercise the same web renderer that `M0-08`
  screenshots and that this container can actually see, which is the only render
  path verifiable here anyway. What is not covered is native-only behaviour —
  platform-split files, native modules, gesture handling. Those need a device or
  a real simulator, and `CLAUDE.md`'s layering rule already says logic must sit
  in `packages/flight-sim` rather than in components for exactly that reason.
- **Alternatives rejected:** downgrading the whole repo to Jest 29 to satisfy
  Expo (drags the working PGlite suite and ts-jest along for a UI-only problem);
  waiting for a `jest-expo` that supports Jest 30 (blocks every UI item until an
  upstream release).

## ADR-009 — Playwright (chromium only), driven by a plain script, not `@playwright/test`

- **Date:** 2026-08-23 · **Iteration:** 9 · **Status:** accepted
- **Context:** `M0-08` needs a headless render path — this container has no
  simulator, so a browser screenshot is the only way any agent ever sees the
  UI. Something has to boot a web build, drive a browser to it, and save a PNG.
- **Decision:** the plain `playwright` package (not `@playwright/test`, which
  would also pull in a test runner and reporter this repo does not need) as a
  devDependency, driven from a small script (`scripts/shot.mjs`) rather than a
  Playwright test file. Chromium only — no WebKit or Firefox, since the app has
  no browser-specific behaviour to catch and every extra browser is another
  binary to install in CI. The script prefers a pre-installed browser at
  `/opt/pw-browsers/chromium` when present (this development container ships
  one outside Playwright's managed cache) and otherwise falls back to
  Playwright's normal resolution, which is what a real CI runner uses after an
  explicit `playwright install --with-deps chromium` step.
- **Consequences:** `pnpm run shot -- <story>` is the one command that lets an
  agent see a screen. `M1-05`'s frozen-clock screenshot tests and any future
  visual check build on this same script rather than reinventing browser
  automation. Cost: a second browser download path to keep working (CI's vs.
  this container's), traded for not depending on any one container's specific
  pre-installed binary always being there.
- **Rejected:** `puppeteer` (Playwright's multi-browser API and auto-waiting
  are worth the same dependency weight, and Playwright is also what `M1-05`'s
  eventual pixel work would reach for); requiring every session to run
  `playwright install` itself (this container cannot always reach Playwright's
  CDN, and re-downloading ~150 MB per session is wasteful when a build is
  already sitting on disk).
