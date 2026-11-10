# Why the agent missed the skill (2026-11-03)

The author's own Claude Code transcripts were searched for turns where they typed `status`
(86 turns over three weeks of daily work). `tools/lint_reply.py` was run on every reply.

| Measured | Result |
|---|---|
| Replies that broke at least one rule | **77 of 86 (90%)** |
| `status` turns where the skill was invoked (Skill tool) | **0 of 86** |
| `status` turns that came after a compaction | 83 of 86 |
| Replies without next-step buttons (desktop app) | 55 of 86 |
| "Remember the skill" messages from the author | 8+ |

## Root causes, ranked

1. **Nothing forced the skill to load.** A skill is picked by the model from its description. In
   a long, compacted thread a short `status` reads like a normal question, so the agent answered
   from memory of the format and never invoked the skill: 0 of 86. A hook is the only
   deterministic fix (see `hooks/`).
2. **Other instructions described the format differently.** The author's project instructions
   said "a TASK|why|status chart" and "next action first". The agent copied that: 72 replies had
   the wrong header or no status emoji, and many opened with "Next action: …".
3. **The host asks for a summary.** The Claude Code desktop app asks for a closing message and a
   recap. Without the skill saying where that summary goes, the agent wrote it above the table
   (55 replies with prose around the table).
4. **Table cells filled with references.** 45 replies put PR numbers, hashes or links in the
   Task column.

## Each failure and its test

| Id | Failure | Eval | Lint rule |
|---|---|---|---|
| F1 | skill not invoked | `status-inside-sentence`, `status-after-compaction`, `done-report-no-preamble` | (hook) |
| F2 | hand-made table (wrong header, no emoji) | `pending-command-and-forgotten-item` | F2 |
| F3 | prose before or after the table | `done-report-no-preamble` | F3 |
| F4 | more than one next action | `one-next-action` | F4 |
| F5 | asks the user to paste output | `reads-terminal-not-paste` | F5 |
| F6 | ✅ without proof | `claim-is-not-proof` | (eval only) |
| F7 | links or numbers in Task | `done-report-no-preamble` | F7 |
| F8 | hub thread relays a child's merge or adopt ask | `hub-no-child-merge` | (eval only) |
| F9 | all rows ✅ but no archive prompt or way back to the parent (or roadmap) thread | `all-done-archive`, `nothing-pending` | (eval only) |
| F10 | same table sent again on a turn the user did not type (background task finished) with nothing changed | `no-repeat-table` | (eval only) |
| F11 | finished thread ends with no archive prompt (a done report, or another thread's work still running) | `done-report-archive`, `done-child-running` | (eval only) |
| F12 | open row with no ETA, so the user can't tell when it finishes | `pending-command-and-forgotten-item` | F12 |
| F13 | wrong table shape: a thread table that is not exactly 3 rows (✅ last finished, now, 👉/⏸ next), a hub (main) table that folds rows (`+N more`) or is not grouped, or a master table without counts, with more than 5 critical rows or a critical row with no owning thread | `pending-command-and-forgotten-item`, `root-roadmap-status`, `long-thread-compact`, `leaf-under-main`, `main-by-children`, `master-roadmap-status` | F13 |
| F14 | 👉 row asks the user to run something (run, merge, tag) but no command block is under the table, or it points at a command "above" | `pending-command-and-forgotten-item` | F14 |

`tests/test_repo.py` fails if a row here names an eval folder that does not exist.

## What changed in 2.3.1

- The Run block is never skipped (owner ask, 2026-11-10: replies said "run the merge above" with
  no block, many times). In the desktop app, text written before tool calls is hidden and the
  next-step box shows no code, so a command only counts when its block sits under the table in
  the final reply, after `wrap_up`. New Step 6 rule and "Before you send" check 10.
- The reply linter (and the GitHub Action) learns F14: a 👉 run/merge/tag/push/install/compact
  row with no command block, or a pointer to a command "above".

## What changed in 2.3.0

- Three modes, picked by where STATUS runs (owner ask, 2026-11-05). 2.2.0 had two shapes and
  only the one roadmap thread was the hub, so other parents with child threads got a 3-row table
  that hid their children, and nothing summarized several hubs at once.
- Mode order, first match wins: an explicit `level: master|main|leaf` marker in the first 10
  lines of the roadmap file this thread keeps (or a `MASTER_ROADMAP.md`); else a thread that
  started or tracks child threads is MAIN; else LEAF. A marker in a file the thread only reads
  (a child reading its parent's `ROADMAP.md`) does not count. Works without session tools.
- LEAF: the 3-row table (unchanged). MAIN: the grouped hub table, now for any parent with
  children, also one with no roadmap file. MASTER: a `Main threads` group (one row per main
  thread: health emoji plus `<n> open, <n> blocked, <n> need you`), then a `Critical` group of at
  most 5 rows (needs you, failed, blocked first), each naming its owning thread.
- `MASTER_ROADMAP.md` lists each main thread and the roadmap file it keeps; the master reads them
  read-only and never edits them.
- The reply linter (and the GitHub Action) learns the master shape under F13. New evals:
  `leaf-under-main`, `main-by-children`, `master-roadmap-status`.

## What changed in 2.2.0

- Two table shapes (owner ask, 2026-11-05). The 4-row cap with a `+N more` fold hid work in the
  hub, and in other threads the user still had to read up to 4 mixed rows to find "what just
  happened, what is happening, what's next".
- Every thread except the hub: exactly 3 rows, always in the same order: ✅ last finished,
  currently working (🔄, or ⚠️/❌/⏸), next step (👉, or ⏸ `after X`). Extra open items go in
  row 3's `then:` list, never dropped.
- Hub (roadmap) thread: every open row, expanded, grouped under bold label rows in the order
  Needs you, Running, Waiting, Done, each open row with its ETA. No row cap, no fold.
- The reply linter (and the GitHub Action) adds rule F13 and drops the old "max 4 rows" check;
  it tells the shapes apart by the group label rows. Covered by F13.

## What changed in 2.1.0

- ETA on every open row (owner ask, 2026-11-04): only 👉 rows had a time estimate, so running and
  waiting rows gave no hint of when they would finish. Every row that is not ✅ now ends its
  Status with an ETA (`~5 min`, `~1 h`) or what it waits on (`after CI`). It stays in the Status
  cell, not a new column, so the header, the linter, the Action and the thread deck keep working.
- The reply linter (and the GitHub Action) adds rule F12: an open row with no ETA fails. Replies
  saved before 2.1.0 may need an ETA added. Covered by F12.

## What changed in 1.10.0

- No repeat tables (owner feedback, 2026-11-04). After background tasks finished, the agent sent
  the same 4-row table three times in a row, rows shuffled, same 👉 action. Causes: no rule for
  turns the user did not type, "use it on every reply" read as every turn, no "nothing changed"
  rule, and the Stop hook kept treating a notification turn as the earlier `status` turn, so it
  sent a short reply back until it became a full table.
- Fix: a turn the user did not type gets a new table only when a row changed (new ✅, ❌ or ⚠️, or
  a different 👉 action); otherwise at most one line. Unchanged rows keep their order and words.
  The Stop hook skips notification turns. Covered by F10.
- Archive prompt hard to miss (owner feedback, 2026-11-04): finished threads still ended with a
  table and no way back. Causes: "if nothing needs the user, give no button" won; a `wrap_up`
  recap with no ask draws no box; a 🔄 row for another thread's work meant "not all ✅". Fix:
  the archive prompt beats the no-button rule, counts only this thread's own rows, applies to
  done reports too, and Step 4 shows the `wrap_up` call. Covered by F11.

## What changed in 1.9.0

- When every row is ✅, the one next action is an archive prompt: archive this thread and go back
  to the parent thread, or to the roadmap thread when there is no parent (owner feedback,
  2026-11-03). Covered by F9.

## What changed in 1.7.0

- The description names every way the user says status, plus done and hand-back reports, and
  says a hand-made table does not count.
- One rule near the top: the reply starts with the table header; a summary is a ✅ row.
- Step 6 says where the summary and buttons go in a host with a next-step box.
- "Never" became a 6-question check to run before sending (same rules, no new ones).
- Hub mode: the hub only consolidates; a child's merge or adopt step stays in the child
  thread (owner feedback, 2026-11-03).
- Optional hooks: a reminder on every `status` prompt, and a Stop hook that sends a broken
  reply back once.
