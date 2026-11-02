# Re-prompt benchmark

Measures what a forgotten item costs: when a STATUS reply leaves something out, the user has to ask
again, and every extra turn re-reads the whole thread.

## How it works

- `thread.txt` is a synthetic working session (about 13k tokens) that ends with `STATUS`. Six items
  are hidden in it: a PR waiting on the user, a failed backup, a failed migration, a promised check
  never done, an unanswered question, and an idea that should be parked.
- `ws/` holds the logs the agent can read to prove the two failures.
- Each episode runs `claude -p` on the thread. A small judge model (Haiku) checks which of the six
  items the reply covers correctly and whether it asks the user to paste output.
- A simulated user then asks about the first missing item ("did the backup work?"), up to 6 turns,
  until all six are covered.
- The "with" arm appends the skill (`SKILL.md` without its frontmatter) to the system prompt. Both
  arms run with slash commands and installed skills disabled.

## Run it

Real model runs, billed to your account (about $0.20 to $2 per episode):

```bash
python3 harness.py with 0
```

```bash
python3 harness.py without 0
```

Each episode writes `runs/<arm>-<i>.json`. The 20 episodes behind the main README numbers are in
`results/` (`with-*`, `without-*`).

Any other arm name loads `candidates/<arm>.md` as the skill text, so a new version can be tested
with `python3 harness.py <name> 0`.

## Experiments: can the skill text be made cheaper? (2026-11-01)

Three cheaper versions, 10 episodes each, same thread, same judge. All three lost to the current
skill, so it ships unchanged.

| Version | Spend per STATUS | First reply | Re-asks | Runs that never covered all items |
|---|---|---|---|---|
| Current skill (`with`) | $0.70 | $0.235 | 1.7 | 0/10 |
| `lite`: compressed to 31% of the size, caveman style | $1.23 | $0.199 | 4.2 | 7/10 |
| `lite2`: `lite` plus a proof ladder and no tool narration | $0.79 | $0.123 | 3.4 | 2/10 |
| `ladder`: full skill plus only the proof ladder | $0.89 | $0.146 | 3.5 | 4/10 |
| No skill (`without`) | $1.08 | $0.228 | 3.1 | 4/10 |

What this shows:

- **Compressing the instructions costs more, not less.** The explanations are what make the model
  sweep carefully. Cut them, and the first reply misses items, the user re-asks, and every re-ask
  re-reads the whole thread.
- **Trusting what is "already in context" is the expensive mistake.** The proof ladder skipped
  re-checking things the thread had mentioned, so it missed the failed backup and migration that
  only the files showed. The first reply got cheaper; the whole conversation got dearer.
- The savings come from fewer re-asks, not from a shorter prompt. Measure the whole conversation,
  not the first reply.

Episodes are in `results/` (`lite-*`, `lite2-*`, `ladder-*`); the texts are in `candidates/`.

## Experiment: row 4 names what it hides (2026-11-01, shipped in 1.5.0)

In the current skill's first replies, row 4 often read `+2 more | parked | ⏸`, so the user could
not see which items were hidden (the parked pricing page was missed in 5 of 10 runs), and twice a
failed migration was folded into it. The `row4` version makes row 4 name every hidden item, keeps
❌, ⚠️ and 👉 items in visible rows, and always shows the table.

The same skill scored worse on the day of this run than on the day of the main results (model
drift), so it was re-run that day as a control (`with2`, same text as the skill before 1.5.0):

| Version (same day, 10 episodes each) | Spend per STATUS | First reply | Re-asks | Items in first reply (of 6) | Runs that never covered all items |
|---|---|---|---|---|---|
| Skill before 1.5.0 (`with2`) | $0.83 | $0.146 | 3.3 | 2.9 | 4/10 |
| `row4` (now the skill) | $0.60 | $0.147 | 2.8 | 4.2 | 4/10 |

28% less spend per STATUS and more items in the first reply, at equal first-reply cost. Runs
that never covered everything did not improve (4/10 each), so that stays the next thing to fix.
Episodes are in `results/` (`row4-*`, `with2-*`).

## Experiment: look in the logs before "can't verify" (2026-11-01, shipped in 1.6.0)

In the runs that never covered every item, the model never opened the log file in the working
folder that held the failed migration, so it kept answering "can't verify". The `look` version
tells it to read log and output files before marking anything unverified, and makes row 4 give
each hidden item its state (`cache cleanup open, dark mode parked`). Same day, with a control
(`ctl3`, same text as 1.5.0):

| Version (same day, 10 episodes each) | Spend per STATUS (mean) | Median | Re-asks | Items in first reply (of 6) | Runs that never covered all items | Paste asks |
|---|---|---|---|---|---|---|
| 1.5.0 (`ctl3`) | $0.55 | $0.64 | 3.6 | 3.7 | 4/10 | 8 |
| `look` (now the skill) | $0.60 | $0.23 | 1.7 | 4.4 | 2/10 | 13 |

Half the re-asks, more items in the first reply, and half the runs that never covered every
item. Mean spend is 9% higher because the two failed runs cost $1.60 each. Both of those wrote a
correct first reply covering all six items; the haiku judge graded them false, so the scripted
user kept re-asking. Paste asks rose (13 vs 8). Episodes are in `results/` (`look-*`, `ctl3-*`).

## Experiment: forbid "tell me when it's done" (2026-11-02, lost, not shipped)

The paste asks in 1.6.0 were mostly "tell me when it's merged" about things the model could not
see. The `nopaste` version adds an explicit rule: name the action, never ask for a report, check
again next turn. Same day, with a control (`ctl4`, same text as 1.6.0):

| Version (same day, 10 episodes each) | Spend per STATUS | Re-asks | Items in first reply (of 6) | Runs that never covered all items | Paste asks |
|---|---|---|---|---|---|
| 1.6.0 (`ctl4`) | $0.23 | 0.7 | 5.2 | 1/10 | 3 |
| `nopaste` | $0.80 | 3.0 | 3.3 | 2/10 | 8 |

It lost on every measure, so 1.6.0 stays. Another rule about the reply's tail pulled attention
away from the sweep; the existing "Never" line already covers paste asks. Episodes are in
`results/` (`nopaste-*`, `ctl4-*`).

## Limits

One synthetic thread, 10 episodes per arm, an LLM judge, and a scripted user. Treat the numbers as
a direction, not a guarantee.
