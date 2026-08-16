# Questions for the human

The loop writes here when it hits a decision only a person can make: product
ambiguity, credentials, spend, or a conflict with `docs/PRODUCT.md`. A hard bug
or an unfamiliar API is **not** a question — that is the job.

To answer: fill in `**Answer:**` and change `[open]` to `[answered]`. The next
iteration picks it up on the next firing; there is nothing to restart.

If a question sits open for more than 24 hours and its recommendation is safe,
the loop takes its own recommendation, records an ADR, and proceeds. It degrades
toward progress, not toward deadlock.

---

## Q-001 — [open] — iteration 0 — item M0-07

**Question:** What is the app actually called?

**Why blocking:** It goes in `app.json`, the bundle identifier, the Expo slug
and every user-facing string. Changing it after those exist is a chore, and the
bundle id in particular is painful to change once a build has been submitted.

**Constraint:** It must not be **Carrier Pidge** — that is the existing App
Store app (id 6762161637) whose mechanics this project reproduces. Reusing the
name invites a takedown and makes the work unpublishable.

**Options:**
(a) `Loft` — the current working name. Short, in-fiction, the place a homing
    pigeon returns to. Likely crowded as a bare App Store name.
(b) `Homing` — names the mechanic and the feeling at once.
(c) `Palomar` — Spanish for pigeon loft; distinctive in English-language stores.
(d) Something else entirely.

**My recommendation if you do not answer:** (a) `Loft` as the internal product
name, with the App Store display name deferred to `M4`. Nothing ships before
then, so this only needs to be settled once a build is submitted.

**Answer:**

---

## Q-002 — [open] — iteration 0 — item M1-08

**Question:** Which Supabase project should the loop deploy migrations to, and
where do its credentials live?

**Why blocking:** Auth flows, Realtime authorization and real `pg_cron`
behaviour cannot be tested against PGlite (see ADR-006). Validating them needs a
real project. The loop has no way to create one or to hold a secret.

**What is needed:** a free-tier Supabase project, with `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ACCESS_TOKEN` set
as GitHub Actions repository secrets.

**My recommendation if you do not answer:** the loop keeps building against
PGlite and defers every item that requires a live backend, noting the growing
gap in `docs/JOURNAL.md`. Work continues; it just cannot verify auth or Realtime
until this exists.

**Answer:**

---

## Q-003 — [open] — iteration 1 — infrastructure

**Question:** Can GitHub Actions be enabled for this repository?

**Why it matters:** The `verify` workflow is queued and then fails in about two
seconds with no runner assigned (`runner_id: 0`, empty `runner_name`), no step
output, and a 404 on its logs. That is GitHub declining to schedule the job, not
a failing build — three runs behaved identically, including on the very first
push.

**Likely causes:** Actions disabled for the repository or the account, or a
spending limit of zero. Both are in repository/account settings and cannot be
fixed by any commit.

**Impact if left alone:** low but real. `pnpm run verify` runs in every
iteration and is the actual gate, so the loop keeps working and keeps the branch
green. What is lost is the independent second check — an iteration that somehow
leaves a broken commit would not be caught by anything outside itself.

**Note:** `docs/LOOP.md` §1 was amended in iteration 1 so the loop recognises a
never-scheduled job and does **not** treat it as work. Without that, it would
have spent all 60 iterations trying to fix something outside the repository.

**My recommendation if you do not answer:** carry on. Local `verify` is a strong
gate on its own, and CI will start working the moment the setting changes, with
nothing to redeploy.

**Answer:**
