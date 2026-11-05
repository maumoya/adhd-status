<p align="center">
  <img src="assets/header.png" alt="adhd-status, a free open source ADHD-friendly status board skill for Claude Code: say STATUS, get one tiny table and one next step" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude%20Code-skill%20%2B%20plugin-7c5cfc" alt="Claude Code skill and plugin">
  <img src="https://img.shields.io/badge/ADHD-friendly-22c55e" alt="ADHD friendly">
  <a href="#results"><img src="https://img.shields.io/badge/eval%20score-0.96%20vs%200.50-2da44e" alt="Eval score: <!--fact:eval_with-->0.96<!--/fact--> with the skill vs <!--fact:eval_without-->0.50<!--/fact--> without"></a>
  <a href="#results"><img src="https://img.shields.io/badge/spend%20per%20STATUS-%E2%88%9235%25-2da44e" alt="Spend per STATUS: 35% less"></a>
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license">
  <a href="https://opensource.org/license/mit"><img src="https://img.shields.io/badge/Open%20Source-OSI%20approved%20license-3DA639?logo=opensourceinitiative&logoColor=white" alt="Open Source: OSI-approved MIT license"></a>
  <a href="PRIVACY.md"><img src="https://img.shields.io/badge/privacy-no%20tracking%20%C2%B7%20no%20data%20collected-7c5cfc" alt="Privacy: no tracking, no data collected"></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/maumoya/adhd-status"><img src="https://api.scorecard.dev/projects/github.com/maumoya/adhd-status/badge" alt="OpenSSF Scorecard"></a>
  <a href="https://www.bestpractices.dev/projects/16177"><img src="https://www.bestpractices.dev/projects/16177/badge" alt="OpenSSF Best Practices"></a>
</p>

<p align="center">
  <img src="assets/demo.gif" width="720" alt="Demo: a long agent session, the user types STATUS, and the agent replies with a four-row table. The migration is the user's turn, the rate limit was forgotten, the signup form is in tests and the README fix is merged, followed by one button: npm run migrate.">
</p>

<p align="center">
  <a href="#results"><img src="assets/savings-card.svg" width="480" alt="35% less spend per STATUS: $0.70 vs $1.08"></a>
</p>

# adhd-status

**The free, open source ADHD-friendly status board for Claude Code and AI coding agents.** Say
`STATUS`, get one tiny table and one next step. Built for focus, executive function and context
management. MIT licensed.

**Measured:** scores **<!--fact:eval_with-->0.96<!--/fact--> with the skill vs <!--fact:eval_without-->0.50<!--/fact--> without** on <!--fact:eval_cases-->11<!--/fact--> status cases (<!--fact:eval_version-->1.7.0<!--/fact-->), and
spends **<!--fact:spend_less-->35%<!--/fact--> less per STATUS** in a long thread because you rarely have to ask again
([results](#results)).

An open source skill for Claude Code (and other agents that read `SKILL.md` skills, the open Agent
Skills format) that turns **STATUS** into a zero-reading status board.

Say `STATUS` in any working session and you get:

- one tiny **Task | Why | Status** table of exactly 3 rows: ✅ last finished, 🔄 currently
  working, 👉 next step (plain words, emoji status, an ETA on every open row: `~5 min`, `after CI`)
- exactly **one** next action you can click or run
- nothing forgotten: the agent sweeps the whole conversation with a built-in completion check first, so
  promised-but-dropped work shows up as a row
- no "paste the output" or "tell me when done": the agent checks results itself
- **one task per thread**: new work goes to a new thread; a finished thread reports back to its
  parent thread, then compacts and closes
- **hub mode**: a `ROADMAP.md` file is the summary page of every task in flight. One hub thread
  keeps it (your existing roadmap thread if you have one, else the root thread); child threads
  update only their own row when they hand back; STATUS in the hub thread shows every open row,
  expanded and grouped (Needs you, Running, Waiting, Done), no fold
- the hub only consolidates: a child thread's merge or deploy step stays in that child thread, and
  the hub row just points to it
- a nudge to compact (at a milestone, never mid-fix) or start fresh when the conversation gets long
- hard to miss: it loads on every way you say status (also inside a sentence and after a
  compaction) and on every done or hand-back report; optional hooks make it certain

Built for ADHD brains, useful for anyone juggling several things in one session.

See [`examples/status-reply.md`](examples/status-reply.md) for a sample reply.

## Install

### One command (recommended)

Installs adhd-status as a personal skill, linked so `git pull` updates it. Nothing else is needed:
the completion sweep is built in.

```bash
mkdir -p ~/src ~/.claude/skills && git clone https://github.com/maumoya/adhd-status.git ~/src/adhd-status && ln -s ~/src/adhd-status/skills/adhd-status ~/.claude/skills/adhd-status
```

Restart Claude Code (or start a new session), then say `STATUS`.

### As a Claude Code plugin

```
/plugin marketplace add maumoya/adhd-status
/plugin install adhd-status@adhd-status
```

### As a plain skill

Claude Code loads personal skills from `~/.claude/skills/`.

```bash
git clone https://github.com/maumoya/adhd-status.git ~/src/adhd-status
ln -s ~/src/adhd-status/skills/adhd-status ~/.claude/skills/adhd-status
```

The symlink means `git pull` updates it. To copy instead, copy the `skills/adhd-status` folder to
`~/.claude/skills/`. For one project only, put it in that project's `.claude/skills/`.

## Use

Type any of these in a session:

```
STATUS
status?
where are we
what's left
```

## Tip: keep the board through compaction

Add this line to your project's `CLAUDE.md` so a `/compact` keeps what the board needs:

```
Compact instructions: keep every open task, its status, any command given to me, and the parent thread this one reports to.
```

## Never miss it (optional hooks)

A skill loads when the model decides it fits. In long, compacted threads it often answers
`status` without loading it ([why](docs/FAILURES.md)). Two optional hooks make it certain. Add
them to `~/.claude/settings.json` (change the path to where you cloned this repo):

```json
"hooks": {
  "UserPromptSubmit": [{"hooks": [{"type": "command", "command": "python3 -I ~/adhd-status/hooks/status_reminder.py"}]}],
  "Stop": [{"hooks": [{"type": "command", "command": "python3 -I ~/adhd-status/hooks/status_lint_stop.py"}]}]
}
```

- `status_reminder.py` adds one line telling the agent to load the skill when you say status
  (add `--always` to do it on every message).
- `status_lint_stop.py` checks the reply after a status turn and sends it back once if it breaks
  the format (prose above the table, wrong table shape, links in Task, two next actions, a paste
  request).

Check any reply by hand: `python3 tools/lint_reply.py reply.md`.

## Thread deck (Claude desktop app, plugin install)

Running ten threads at once? Type `/deck` in one thread and a pane lists every open thread with
the 👉 row of its last status table, so you see what each one needs from you without opening it.

- **Cards**, sorted: needs you (longest wait first), unclear (no table found), busy, done, quiet.
  Each shows the title, a short id, the PR and how long ago it last moved.
- **Open** tells you which thread to click in the sidebar.
- **Answer** appears only when the 👉 row is a plain question: it ends in `?`, names no merge,
  adopt, deploy, install, approve, release, push, ship or live step, and the thread has no open
  PR. Approvals always happen inside the thread itself.
- **Before it sends**, the deck asks you to confirm, re-reads that thread, and refuses if anything
  moved ("Changed — refreshed") or the thread is working ("Busy — try when idle"). It sends once,
  never retries, and adds one line, `(thread deck · re: …)`, so the thread knows what you answered.
- It refreshes every 10 s while open, shows a red banner when a refresh failed or is over a
  minute old, and pauses after 10 minutes without input (press Resume).

Keep the thread that holds the deck on screen (split view works): a pane only refreshes while it
is visible. The deck reads the desktop app's own session tools on your Mac; nothing is sent
anywhere else and no model is called. Thread text is shown as plain text, never as links or
buttons.

### Check replies in CI (GitHub Action)

The same checker runs as a GitHub Action, listed on the
[GitHub Marketplace](https://github.com/marketplace/actions/adhd-status-reply-lint). Save sample
status replies as Markdown files (for example from your own agent's prompts or evals) and fail the
build when one breaks the format:

```yaml
- uses: maumoya/adhd-status@v2.2.0
  with:
    files: |
      replies/**/*.md
```

Each problem shows as an annotation on the file, the job summary lists every file with its count,
and the `problems` output holds the total. The step fails if no file matches.

## Test it (benchmark)

The `evals/` folder holds test cases in the format `claude plugin eval` reads. From this folder:

```bash
claude plugin eval . --scaffold --allow-tools Edit,Write,Bash
```

It runs each case with and without the skill and reports the score difference. These are real
model runs and are billed to your account.

### Results

**Plugin eval** (1.7.0, 2026-11-03, 11 cases, 3 runs each, `claude plugin eval`): overall score
**<!--fact:eval_with-->0.96<!--/fact--> with the skill vs <!--fact:eval_without-->0.50<!--/fact--> without**. Every run passes in 7 of 11 cases with the skill, 1 of 11
without. In the "forgotten item" case, where one promised task is buried in a long thread, the
skill caught the task 3 of 3 times (2 of 3 without) and scored 0.94 vs 0.28 on the whole reply.
The first run (1.4.0, 2026-11-01, 6 cases, 2 runs each) scored 0.95 vs 0.65, with the forgotten
task caught 83% vs 25% of the time.

**Re-prompt cost** (1.4.0 vs no skill, 2026-11-01, [`bench/reprompt/`](bench/reprompt/), 10 episodes per arm, one ~13k-token
thread with 6 open items, the user asks again about each item the reply misses):

| Per STATUS, until every item is covered | With skill | Without |
|---|---|---|
| Average cost | **<!--fact:cost_with-->$0.70<!--/fact-->** | <!--fact:cost_without-->$1.08<!--/fact--> |
| Median cost | $0.59 | $1.08 |
| Times the user had to ask again | **1.7** | 3.1 |
| Items right on the first reply | 4.5 of 6 | 3.9 of 6 |
| Episodes that never covered all 6 (6 turns) | **0 of 10** | 4 of 10 |
| Times it asked the user to paste or report | **2** | 23 |

The first reply costs about the same in both arms (~$0.23). The saving comes from fewer follow-up
turns: about **<!--fact:spend_less-->35%<!--/fact--> less spend per STATUS** in this test. In short, tiny eval threads with nothing to
forget, the skill's extra instructions make a single reply cost more; the payoff shows up in long
threads, where forgetting is likely.

Small sample, one synthetic thread, an LLM judge: a direction, not a guarantee. The harness and all
20 episode logs are in [`bench/reprompt/`](bench/reprompt/).

**Since then** (each tested against the previous version on the same day, 10 episodes per arm):

| Version | What changed | Measured vs the version before |
|---|---|---|
| 1.5.0 | row 4 names every hidden item; failures always get their own row | **28% less** spend per STATUS, 4.2 vs 2.9 items right on the first reply |
| 1.6.0 | reads log files before saying "can't verify" | **half** the re-asks (1.7 vs 3.6), runs that never covered everything 2 vs 4 of 10 |
| 1.7.0 | hard to miss: loads on every status and done report, table first, one check before sending, hub only consolidates | same spend per STATUS (median $0.084 vs $0.079, 4 episodes per arm), paste asks 0 vs 2 |

1.7.0 fixes the format, not the cost: it was built from 86 real `status` turns where the skill was
never loaded ([why](docs/FAILURES.md)). Against "no skill", the full plugin eval on 1.7.0
(2026-11-03, 11 cases, 3 runs each) scores **<!--fact:eval_with-->0.96<!--/fact--> with the skill vs <!--fact:eval_without-->0.50<!--/fact--> without**; every failure
found has its own eval case. Details in [`bench/reprompt/README.md`](bench/reprompt/README.md).

## Security at a glance

The [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/maumoya/adhd-status) badge
at the top is an automated, independent check of how this repository is run. The skill itself is
one Markdown file: no code, no network calls, no data collected (see [PRIVACY.md](PRIVACY.md)).

| Check | Score | What it means here |
|---|---|---|
| Dangerous workflows, token permissions, pinned actions, vulnerabilities, binaries | 10 | CI cannot be hijacked by a pull request, tokens are read-only by default, every action is pinned to a commit |
| Code scanning (CodeQL), CI on pull requests | 10 | every change is scanned before it reaches `main` |
| Branch protection | 8 | `main` blocks force-push and deletion; changes need a pull request and a passing CodeQL check |
| Signed releases | 10 | each release ships with signed SLSA provenance (see below) |
| Code review | 0 | one maintainer, so no second person approves changes yet |
| Maintained | 0 | new repository; this check starts counting after 90 days |
| Fuzzing | 0 | there is no code to fuzz |

### Verify a release

Each [release](https://github.com/maumoya/adhd-status/releases) has the skill as a zip plus a
`*.intoto.jsonl` provenance file signed with Sigstore. Check it with
[slsa-verifier](https://github.com/slsa-framework/slsa-verifier):

```bash
slsa-verifier verify-artifact adhd-status-v2.2.0.zip --provenance-path adhd-status-v2.2.0.intoto.jsonl --source-uri github.com/maumoya/adhd-status --source-tag v2.2.0
```

## FAQ

**What is adhd-status?**
A free, open source (MIT) skill for Claude Code and other AI coding agents. When you say `STATUS`,
the agent replies with one tiny Task | Why | Status table and exactly one next step you can click
or run.

**Who is it for?**
Developers with ADHD, and anyone who loses track of tasks, pending commands or promises in long AI
coding sessions.

**Is it free and open source?**
Yes. MIT license, OSI-approved. Use it, fork it, change it.

**Which agents does it work with?**
Claude Code (as a skill or a plugin) and any agent that loads `SKILL.md` skills.

**How is it different from a todo list?**
The agent builds the board itself from the whole conversation, checks results on its own (no
pasting output), shows 3 rows (last finished, now, next) and gives one next action, so there is nothing to read
through.

**Does it need anything else?**
No. It is one self-contained skill: the completion sweep that keeps anything from being missed is
built in.

## How this skill was launched

The whole publishing journey is public, with real numbers: OpenSSF Scorecard 5.9 → 7.4, Best
Practices passing, what is still open, and the measure → fix → re-measure loop to launch any skill.

- [Publishing playbook](docs/PUBLISHING_PLAYBOOK.md) (reads on GitHub)
- [Interactive progress page](docs/progress.html) with tick boxes (download and open, or view on the
  project site once it is live)

## Credits

- Time estimates, visible wins and the no-preamble rule are inspired by
  [i-have-adhd](https://github.com/ayghri/i-have-adhd) by Ayoub G. (MIT). It pairs well with this
  skill if you want every reply ADHD-shaped, not just STATUS.
- The completion sweep (re-read the asks, treat reports as claims, never call it done with a part
  missing) adapts ideas from [unlazy](https://github.com/Leonxlnx/unlazy) by Leonxlnx (MIT).

## About the author

Hi, I'm **Mauricio Alonso Moya Tapia** ([@maumoya](https://github.com/maumoya)). I built adhd-status
because I wanted AI coding sessions that tell me in one glance what is done and what is next, so
nothing gets lost.

Say hi or follow my work on [LinkedIn](https://www.linkedin.com/in/mba-mmoyat/).

## License

MIT. Copyright (c) 2026 Mauricio Alonso Moya Tapia.

The Open Source Initiative® logo is a trademark of the Open Source Initiative. Its use here only
marks that the MIT license is OSI-approved; it does not imply OSI endorsement of this project.
