# Recording the demo flight

`pnpm run demo:run` (`scripts/demo-harness.mjs`, item `M1-09`) plans one
fixed, seeded LA→NYC flight — Ana releasing a bird to Priya — and plays it
back on a compressed clock, printing a checklist line to the console as each
moment arrives. It never touches a screen itself: this container has no
simulator (`CLAUDE.md`), so recording the *app* rendering these same moments
is a job for a human with a real device or this repo's web build
(`pnpm --filter mobile run web`), watching the console alongside it.

## Before you start

1. Set `EXPO_PUBLIC_E2E=true` and `EXPO_PUBLIC_TIME_SCALE=1440` wherever the
   app itself is running (`.env.local`, or inline on the command that starts
   it). Without `EXPO_PUBLIC_E2E=true` the app's own clock ignores
   `EXPO_PUBLIC_TIME_SCALE` entirely and runs in real time — this is
   deliberate (`docs/ROADMAP.md` M1-09's own "Do NOT"), so a production
   build can never accidentally ship a fast clock.
2. Start recording your screen.
3. Run `pnpm run demo:run` in a second terminal, visible in the recording
   or narrated alongside it.

## The checklist

The runner prints one line per moment, each timed against the flight's own
release-to-resolution span rather than the wall clock, so they line up
whatever `--scale` you pass (default `1440`: a flight lands in real seconds
instead of real hours):

| Moment | What the app should be showing |
|---|---|
| Release (0%) | The compose screen's confirmation, then the flight card appearing. |
| A quarter flown | The chart's route line a quarter solid, three-quarters dashed. |
| Halfway | The flight card's ETA reading roughly half the original wait. |
| Three-quarters flown | The marker closing in on the destination. |
| Resolution (100%) | Delivered reveals the note as a scene; lost shows the sender's memorial — never both, and never anything to the recipient for a loss. |

The demo flight is planned as a first-ever release, which `docs/PRODUCT.md`
§6 guarantees never dies — so a recording always reaches "Delivered." Pass
`--scale=<n>` to run faster or slower than the default 1440 (a real LA→NYC
flight resolves in roughly `durationMs / n` seconds).

## What this does not do

It does not drive a browser or take screenshots itself — that is
`scripts/shot.mjs`'s job for a single frozen frame, not a played-back
flight. It does not require a live Supabase project: the seeded flight plan
comes from the same pure engine every screen already renders
(`@pidge/flight-sim`), never a real release.
