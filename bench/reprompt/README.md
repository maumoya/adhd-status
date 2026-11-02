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

## Limits

One synthetic thread, 10 episodes per arm, an LLM judge, and a scripted user. Treat the numbers as
a direction, not a guarantee.
