# One click closes a finished thread (2.5.0)

A thread finished its task. CI failed on one lint error, and merging needs the user's OK.

## Before (2.4.0): three asks for one chain

Reply 1:

| Task | Why | Status |
|---|---|---|
| CSV export | users download data | ✅ code done |
| CI checks | safe to merge | ❌ lint error, ~2 min |
| Fix lint | green checks | 👉 you: Fix it?, ~1 min |

`[Fix it]`

Reply 2, after the fix: `[Merge]`. Reply 3, after the merge: `[Archive → back to Planning]`.

Three clicks, three replies and three tables in the thread's context.

## After (2.5.0): one ask covers the whole chain

| Task | Why | Status |
|---|---|---|
| CSV export | users download data | ✅ code done, 212 tests pass |
| CI checks | safe to merge | ❌ lint: unused import, ~2 min |
| Close out | fresh start | 👉 you: Close out, ~5 min |

`[Close out]` → fix CI, merge on green, adopt, report to Planning, archive. No further asks.

In a thread with a hub parent, the child fixes CI, reports and stops; the hub merges, adopts
and archives it with no click at all. When nothing is blocked, there is no button: the thread
closes itself.
