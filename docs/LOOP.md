# Iteration protocol

You are one iteration of an autonomous development loop. **Your context is empty
and will be discarded when you finish.** Everything the next iteration knows, it
knows because you wrote it to a file and pushed it.

Execute these steps in order. Do not skip. Do not reorder.

---

## 0. Sync, then check the kill switch

```bash
cd /home/user/messager-pidge   # or wherever the repo was cloned
git fetch origin
git checkout -B claude/app-development-loop-szg7yj origin/claude/app-development-loop-szg7yj
git reset --hard origin/claude/app-development-loop-szg7yj
```

Read `.loop/state.json`:

- `paused == true` → **stop now.** Say "loop paused" and end. Change nothing.
- `iteration >= budget.max_iterations`, or now is past `budget.stop_after` →
  **stop** and disable the Routine (§9).
- `consecutive_failures >= 3` → **stop**, append to `docs/QUESTIONS.md`, and
  disable the Routine. Three failures in a row means something structural is
  wrong and a fourth burns tokens for nothing.

**Concurrency lease.** If `current_item` is not null and `claimed_at` is under
90 minutes old, another iteration is live: **stop immediately and change
nothing.** If it is older than 90 minutes the claim is stale — steal it, and
record in `docs/JOURNAL.md` that the earlier iteration was abandoned.

## 1. Orient (read only, ~10 minutes)

Read in this order:

1. `docs/PRODUCT.md` — the whole file. This is your anti-drift anchor.
2. `CLAUDE.md`
3. `.loop/state.json`
4. The **last 5** blocks of `docs/JOURNAL.md` (not the whole file)
5. `ROADMAP.md`
6. `docs/QUESTIONS.md` — is anything answered that was blocking?

Then check CI on the previous commit (`mcp__github__actions_list`, then
`get_job_logs` for any failure).

**If CI is red because a check actually ran and failed, that preempts
everything.** Your item this iteration is "fix CI on `<sha>`". Skip §2.

**But distinguish a failing check from a check that never ran.** If the job
completed in a couple of seconds with `runner_id: 0`, an empty `runner_name`, no
step output and a 404 on its logs, then GitHub never scheduled it — that is an
account or repository setting (Actions disabled, or a spending limit), and no
commit you can push will fix it. In that case:

- Do **not** treat it as your item. You would burn every remaining iteration on
  something outside the repository.
- Note it once in `docs/JOURNAL.md` if it is not already noted, make sure a
  question exists in `docs/QUESTIONS.md`, and carry on with §2.
- `pnpm run verify` is the real gate regardless. CI is a second pair of eyes, not
  the source of truth. An iteration that leaves `verify` green locally has done
  its job.

## 2. Select exactly one item

Take the **topmost `todo` item in `ROADMAP.md` whose dependencies are all
`done`** — unless an override applies:

| Condition | Do this instead |
|---|---|
| CI is red | Fix CI |
| `iteration - last_hardening_iteration >= 5` | **HARDENING** (§6) |
| `iteration - last_audit_iteration >= 10` | **AUDIT** (§7) |
| The selected item is size `L` | **Split it** into 2–4 `S`/`M` items, commit `ROADMAP.md`, end the iteration. Splitting is a complete iteration. |

Do not take a second item because the first was quick. One item per iteration is
the whole point; surplus energy goes into tests, not scope.

**Claim it**: set `current_item`, `claimed_at` (ISO 8601) and `claimed_by` in
`.loop/state.json`, set the item's status to `in-progress`, then
`git commit -m "<ID>: claim" && git push`. **Push before implementing** — this
is what stops two overlapping iterations doing the same work.

## 3. Implement

- Stay inside the files listed under **Touches**. Needing a file outside that
  list is a signal: either the item was underspecified (note it in the journal)
  or you are drifting (stop and reconsider).
- Obey the **Do NOT** list literally.
- **Write the tests for the acceptance criteria first**, watch them fail, then
  make them pass. Every test name must contain the item ID in brackets:

  ```ts
  it('[M1-04] the card reads "13h 13m away" at 40% of a LA-NYC flight', () => { … })
  ```

  This is not cosmetic. `pnpm run gate:roadmap` enforces it.
- Never edit `docs/PRODUCT.md`.
- A new runtime dependency requires an ADR in `docs/DECISIONS.md` in the same
  commit.

**Size discipline.** If your net diff exceeds ~600 lines you have taken too
much. Land the coherent subset and file the remainder as a new roadmap item.

## 4. Verify

```bash
pnpm run verify
```

It must be green. **Never** use `--no-verify`, never lower a threshold, never
delete or `.skip` an existing test to get green. If a pre-existing test now
fails, you broke a shipped feature — that is the bug; fix it.

Then self-review with `/code-review --effort high`. Address correctness
findings; note deferred style findings in the journal. If you touched
`supabase/`, auth, or RLS, also run `/security-review`.

Re-run `pnpm run verify` after any review fix.

## 5. Land

1. Tick the acceptance-criteria checkboxes you actually satisfied. **A box may
   only be ticked if a test named `[ITEM-ID]` covers it.**
2. Set the item's status to `done` and change `### [ ]` to `### [x]`.
3. Append a `docs/JOURNAL.md` block. The **"Surprises for the next agent"** line
   is mandatory and must be non-empty — it is the highest-value sentence you
   will write all iteration.
4. Update `.loop/state.json`: `iteration += 1`, `current_item: null`,
   `claimed_at: null`, `last_outcome`, `consecutive_failures: 0`, and
   `test_count_floor` = the new total test count.
5. Commit as `<ITEM-ID>: <imperative summary>`, then push.
6. Refresh the draft PR description with Done / In progress / Next 3.

## 6. HARDENING iteration (no new features)

Take the highest-value item from this list, in order:

1. Any acceptance criterion ticked without a matching test — untick it, file it.
2. Dead code: `npx knip`. Delete what is unreachable.
3. Duplication and over-abstraction: run `/simplify`, apply.
4. Coverage below threshold on `packages/flight-sim`: add tests. **Do not lower
   the threshold.**
5. `any`, `@ts-ignore`, `TODO`, `FIXME`: resolve, or convert to roadmap items.
6. Dependencies added without an ADR: write the ADR or remove the dependency.

Set `last_hardening_iteration = iteration`. Commit as `HARDEN: <summary>`.
**Adding a feature during a hardening iteration is a protocol violation.**

## 7. AUDIT iteration (no code changes except tests)

Re-read **all** of `docs/PRODUCT.md`. For each invariant INV-1…INV-7, find the
code that enforces it and the test that proves it. Overwrite `docs/AUDIT.md`:

```
## Audit — iteration 30 — 2026-09-14
| Invariant | Enforced in | Test | Verdict |
|---|---|---|---|
| INV-1 real time over real distance | packages/flight-sim/src/speed.ts:44 | [M0-03] flies LA to NYC in about 22 hours | ok |
| INV-5 outcome is secret | supabase/migrations/0003_rls.sql:118 | — | **GAP** |
```

Every GAP becomes a `todo` item inserted at the **top** of `ROADMAP.md`.

Also check both directions of drift: does any shipped feature contradict
`PRODUCT.md`? Does `ROADMAP.md` contain items `PRODUCT.md` does not justify?
Both are drift; file them.

Set `last_audit_iteration = iteration`. Commit as `AUDIT: iteration N`.

## 8. When you are blocked

Blocked means a decision only the human can make: product ambiguity, a paid
service, credentials, or a conflict with `PRODUCT.md`. It does **not** mean a
hard bug, an unfamiliar API, or a failing test. Those are the job.

1. Append to `docs/QUESTIONS.md`:

   ```
   ## Q-004 — [open] — iteration 23 — item M2-02
   **Question:** …
   **Why blocking:** …
   **Options:** (a) … (b) …
   **My recommendation if you do not answer:** (a), because …
   **Answer:**
   ```

2. Set the item's status to `blocked` and add `**Blocked by:** Q-004`.
3. Reset the claim, commit, push.
4. **Then continue**: go back to §2 and take the next unblocked `todo`. One
   blocked item does not stop the loop.

If a question has been open for more than 24 hours and its recommendation is
safe, take your own recommendation, record an ADR, and proceed. The loop should
degrade toward progress, not toward deadlock.

## 9. Ending the loop

Stop and disable the Routine when: no `todo` items remain, the budget is
exhausted, there have been 3 consecutive failures, or `paused` is true.

Disable with `update_trigger({trigger_id, enabled: false})` — **do not delete
it**, the user may want to resume. Then send one notification saying why.

## 10. When you cannot get to green

1. Revert the working tree to the last green commit
   (`git reset --hard origin/<branch>`), leaving the branch exactly as green as
   you found it.
2. Append a journal block with `**Outcome:** failed` and the **actual error
   text**, not a paraphrase.
3. Increment `consecutive_failures`, reset the claim, set the item back to
   `todo` with a `**Previous attempt failed:**` note carrying what you learned.
4. Commit and push **that state only**. **Never push a red branch.**
