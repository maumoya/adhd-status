# adhd-status (directory edition)

Say **STATUS** and get one tiny `Task | Why | Status` table plus exactly one next step you can click or run.
The skill sweeps the whole conversation first, so nothing you asked for gets lost. It keeps one task per thread,
puts an ETA on every open row, and tells you when to compact or hand a thread back.

This folder is the **directory edition**: Markdown only. It ships no scripts, hooks or app mods. The skill does its
work with Claude Code's built-in tools (reading files, the conversation, and host tools such as a next-step box
when the host has one).

## Full edition

The full edition lives at the repository root: <https://github.com/maumoya/adhd-status>. It adds what this
folder leaves out:

- a reminder hook and a Stop hook that check a STATUS reply's shape before it is sent
- the thread deck mod for the Claude desktop app
- evals, the reply linter, benchmarks and tests

## Install

From the plugin directory, install **adhd-status**. The repository also has its own marketplace:

```
/plugin marketplace add maumoya/adhd-status
/plugin install adhd-status@adhd-status
```

That marketplace entry installs the full edition from the repository root.

## Use

Type `STATUS` (or "where are we", "what's left", "what do I do now"). See
[skills/adhd-status/SKILL.md](skills/adhd-status/SKILL.md) for the three table modes (leaf, main, master).

## License

MIT. See [LICENSE](LICENSE).
