# Loft — Product Specification

> **IMMUTABLE.** The autonomous loop MUST NOT edit this file. If reality has to
> diverge from this spec, the loop writes the conflict to `docs/QUESTIONS.md`
> and moves on to the next item. Only a human changes this document.
>
> "Loft" is a working name. Choosing and clearing the final one is item
> `M0-07`; it must not collide with **Carrier Pidge**, the existing App Store
> app this project takes its mechanics from.

## 1. One sentence

A messenger in which every message is carried by a pigeon that must physically
cross the real distance between you and the person you are writing to, in real
time, over the real surface of the Earth — and which sometimes does not make it.

## 2. Vision

A note to your roommate lands in ninety seconds. A note from Los Angeles to New
York takes twenty-two hours and arrives while you are asleep. Some pigeons never
arrive: one is taken by a hawk over the Alleghenies, another is lost in fog off
Cape Cod, and the note is destroyed, and neither of you ever reads it.

The app has no practical use and is not trying to acquire one. It exists to turn
the cheapest, most frictionless act in modern life — sending a text — back into
something that costs time, carries risk, and can be lost. What you get in
exchange is the one thing instant messaging destroyed: the feeling of waiting
for a letter.

## 3. Non-negotiable invariants

Each of these must be traceable to code and to a test. The audit iteration
(`docs/LOOP.md` §7) checks exactly this list.

- **INV-1 — Real time over real distance.** Delivery time is real elapsed
  wall-clock time over the real great-circle distance. LA→NYC ≈ 22 h. There is
  no fast path in production code and no way for a user to shorten a flight.
- **INV-2 — Loss is real and permanent.** A pigeon can die mid-flight. The
  message is destroyed — not queued, not retryable, not recoverable, not shown
  to the recipient, and not shown back to the sender.
- **INV-3 — Position is derived, never stored per tick.** A bird's location is a
  pure function of `(origin, destination, departsAt, arrivesAt, now)`.
- **INV-4 — The fate is decided once, at release, deterministically.** Seeded
  from a stored per-flight seed, so client, server and tests always agree.
- **INV-5 — The outcome is a secret until it happens.** No client can learn
  whether a bird survives before the moment it resolves. Enforced by RLS gated
  on `now()`, not by a status flag and not by the client's good manners.
- **INV-6 — The map shows the bird's true position**, not an animation
  decoupled from the model. Reopening the app never replays or rewinds a flight.
- **INV-7 — We never store a precise location.** Every stored coordinate is
  snapped to a city centroid by the database before it is written.

## 4. Design pillars

**1. The wait is the product.** Latency is not a cost we tolerate, it is the
thing we offer. Every design question resolves toward "does this make the wait
more felt, more legible, more worth having?" If a feature's pitch is "get there
sooner," it is disqualified on sight.

**2. Never break the fiction.** The app believes in the pigeon completely and
never winks. Network failure is "the loft cannot be reached." There is no
onboarding slide explaining that this is a joke. The joke only lands played
straight.

**3. Loss must be real.** If loss can be undone with a tap or a payment, the
whole thing is a theme park.

**4. Geography is the mechanic.** Real coordinates, real great circles, correct
across the antimeridian. We do not compress long distances.

**5. Restraint over engagement.** Three notifications exist: your pigeon
arrived, your pigeon did not, and a pigeon is arriving for you. An app about
patience that nags you for attention is a lie.

**6. The bird is a character, not an asset.** Pigeons have names and histories,
not stat blocks and rarities. A bird earns meaning by surviving 9,000 miles over
four years, never by rolling Legendary.

## 5. Tone of voice

Deadpan naturalist crossed with a 19th-century dispatch service. Short
declaratives. Specific nouns, real geography, exact times. No exclamation
points. No emoji in body copy — the dove glyph appears in exactly one place, the
flight card.

| Situation | We write | We never write |
|---|---|---|
| Send confirmed | "Released 4:12 PM. Due tomorrow, 2:14 PM." | "Message sent! 🎉" |
| In flight | "Over Nebraska. Holding against a headwind." | "Delivering… 47%" |
| Arrival | "A pigeon has arrived from Ana." | "New message (1)" |
| Death | "Wren did not arrive. Taken near Altoona, Pennsylvania, at 11:41 PM. The note was not recovered." | "Delivery failed. Retry?" |
| Loft empty | "The loft is empty. Sparrow is due home at 6:20 AM." | "Send limit reached. Upgrade?" |
| Offline | "The loft cannot be reached." | "No internet connection" |

**The one exception:** account, privacy, permission, and data-deletion screens
are written in plain, boring, literal English. Whimsy stops at the consent
boundary. A charming app that obscures its data practices with charm is doing
something worse than being useless.

## 6. Canon: the physics

Product constants. Changing one is a product decision and requires an ADR.

| Constant | Value | Rationale |
|---|---|---|
| `BASE_SPEED_MPH` | 110 | Matches the original. LA→NYC (3,936 km) = 22.2 h. **Never displayed in the UI** — only ETA and distance — so the number stays unfalsifiable in-world. |
| `MIN_FLIGHT_MS` | 90,000 | Even a message across the room gets a release, a flight and an arrival. |
| Max flight | 7 days | London→Sydney is ~4 days. That is the joke working. |
| `BASE_HAZARD_PER_KM` | 2.002e-6 | Calibrated so 1,000 km carries the original's 0.2% risk. Constant hazard per km, so ambition costs something: across town 0.002%, LA→NYC 0.79%, London→Sydney 3.3%. |
| Max death probability | 8% | However brutal the route. |
| First-ever flight | never dies | Losing the tutorial bird teaches the wrong lesson. |
| Death visibility | sender only | The recipient never learns the message existed. |
| Message length | 280 chars | The capsule holds one small note. |

**ETA copy:** `> 24h` → `1d 2h away` · `1h–24h` → `6h 40m away` · `< 1h` →
`18m away` · `< 60s` → `arriving`. Distance: `3,376 mi` / `5,433 km`. No
decimals, never a percentage, never a progress bar.

## 7. The mechanics we add (purist line)

Faithful clone plus depth that deepens the fiction rather than diluting it.

- **The Loft.** Three named birds. Releasing one sends it carrying your note; on
  arrival it rests, then **flies home the same distance**, unavailable until it
  lands. Canon — homing pigeons return, that is what "homing" means. It makes
  sending a decision rather than a reflex, makes distant friends cost more than
  near ones, and makes spam structurally impossible. Return-leg hazard is half
  rate: the bird flies unladen and knows the way.
- **The Columbarium.** A quiet list of every bird you have lost: name, dates,
  lifetime miles, and where it fell. The note is never shown, not even to the
  sender — which is why we can hard-delete it.
- **The Atlas.** Every route your birds have ever flown, on one chart,
  accumulating over years. The app's profile page, its long-term hook, and its
  shareable artifact.
- **Passage.** Real wind sampled along the real route at release, baked into the
  flight plan, plus a dispatch feed: `07:55 — headwind over the Front Range,
  slowed.` This makes a 22-hour wait *readable*. It adds texture and duration;
  it never subtracts.

## 8. Explicit non-goals

Written down because these are exactly what an autonomous agent will drift
toward on its own.

- **No speed.** No boosts, no express birds, no pay-to-skip, no priority send.
  Not even as a joke.
- **No undo.** No unsend, no edit-in-flight, no recall, no resurrect.
- **No streaks, daily quests, daily rewards, or leaderboards.** This is the
  single most likely thing to be proposed. It is forbidden: a streak is a demand
  for daily compliance from an app whose whole thesis is patience.
- **No gacha.** No breeding, no rarities, no trading, no purchasable birds, no
  currency, **no breeds with stats**. A bird's identity comes from its history,
  never from a stat block.
- **No chat furniture.** No typing indicators, no read receipts beyond arrival,
  no reactions, no replies-to-message, no presence. These imply a live channel.
  There is no live channel.
- **No media in v1.** 280 characters, text only.
- **No strangers in v1.** Invite-link only. No directory, no discovery, no
  nearby. Location plus unsolicited contact is a trust-and-safety surface this
  project is not staffed to run.
- **No groups, voice, video, or calls.**
- **No background location.** Ever. `WhenInUse` only, read at explicit moments.
- **No ads, no data sale, no third-party tracking SDKs.**
- **No AI anything.** No suggested replies, no summaries, no chatbot pigeon.
- **No web client shipped to users.** The web build exists only so this
  container can render and screenshot the app.

## 9. Privacy commitments

This app knows roughly where people live and holds their unread mail. That is
not a toy's threat model.

1. **A loft, not a location.** One home point, set explicitly, snapped to a city
   centroid **by a database trigger** before storage. We cannot leak a precise
   coordinate because we never hold one.
2. **You may lie.** Setting a loft somewhere you do not live is fully supported
   and never validated.
3. **Undelivered notes are the sensitive asset.** Today: Postgres at rest, RLS
   forbidding all reads until arrival. We say exactly that, and no more, in the
   privacy policy. End-to-end encryption is the intended end state — the server
   needs `arrives_at`, not the text.
4. **Death deletes.** The payload is destroyed, not tombstoned.
5. **Block is immediate and silent.** Blocked senders' birds are simply never
   seen again, and the sender is not told. In-fiction and safe.
