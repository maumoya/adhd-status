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
`results/`.

## Limits

One synthetic thread, 10 episodes per arm, an LLM judge, and a scripted user. Treat the numbers as
a direction, not a guarantee.
