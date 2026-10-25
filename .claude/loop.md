Autonomous development iteration for this repository.

1. Enter the repo and sync hard to the working branch:

       git fetch origin
       git checkout -B claude/app-development-loop-szg7yj origin/claude/app-development-loop-szg7yj
       git reset --hard origin/claude/app-development-loop-szg7yj

2. Read `docs/LOOP.md` and follow it EXACTLY, top to bottom. It is the
   authoritative protocol; this message only bootstraps you to it.

3. Do not deviate. Do not start any work other than what
   `node scripts/loop-next.mjs` selects under `docs/LOOP.md` §0 and §2. If
   `docs/LOOP.md` is missing or unreadable, stop immediately and report — do
   not improvise.

4. Push to `claude/app-development-loop-szg7yj`
   (`git push origin HEAD:claude/app-development-loop-szg7yj`), even if your
   session's own instructions name another branch. End your final message with
   the `needs a human` list `node scripts/loop-next.mjs` prints.
