#!/usr/bin/env python3
"""Check a STATUS reply against the adhd-status format rules.

Usage: python3 tools/lint_reply.py reply.md   (or pipe the reply on stdin)
Prints one line per problem and exits 1 if there is any. Standard library only.

Each rule id matches a failure in docs/FAILURES.md.
"""
import re
import sys

HEADER = re.compile(r"^\|\s*Task\s*\|\s*Why\s*\|\s*Status\s*\|\s*$")
EMOJI = ("✅", "🔄", "👉", "⏸", "⚠️", "❌")
TASK_NOISE = re.compile(r"\]\(|https?://|#\d+|`|\b[0-9a-f]{7,40}\b|/[\w.-]+/")
ETA = re.compile(r"~\s*\d+(\.\d+)?\s*(s|secs?|m|mins?|minutes?|h|hrs?|hours?|d|days?|w|wks?|weeks?)\b"
                 r"|\bafter\s+\S", re.I)
MORE = re.compile(r"^\+\s*\d+\s+more\b", re.I)
GROUPS = ["Needs you", "Running", "Waiting", "Done"]
GROUP_EMOJI = {"Needs you": ("👉", "⚠️", "❌"), "Running": ("🔄", "⚠️", "❌"),
               "Waiting": ("⏸",), "Done": ("✅",)}
MASTER_GROUPS = ["Main threads", "Critical"]
CRITICAL_EMOJI = ("👉", "❌", "⚠️", "⏸")
COUNTS = re.compile(r"\b\d+\s+open\b|file missing|no roadmap file", re.I)
OWNER = re.compile(r"\bin\s+\S.*\bthread\b", re.I)
LABEL = re.compile(r"^\*\*(.+?)\*\*$")
PASTE = re.compile(r"\bpaste\b|let me know when|tell me when|report back|\bcopy the output\b", re.I)


def lint(text):
    lines = [l.rstrip() for l in text.strip().splitlines()]
    problems = []
    if not lines:
        return ["F2 empty reply: no table"]

    table = [i for i, l in enumerate(lines) if l.lstrip().startswith("|")]
    if not table:
        return ["F2 no Task | Why | Status table"]
    if not HEADER.match(lines[table[0]].strip()):
        problems.append("F2 table header is not exactly | Task | Why | Status |")
    if table[0] != 0:
        problems.append("F3 prose above the table: " + lines[0][:60])

    first, last = table[0], table[0]
    while last + 1 < len(lines) and lines[last + 1].lstrip().startswith("|"):
        last += 1
    if any(i > last for i in table):
        problems.append("F2 more than one table")
    rows = lines[first + 2:last + 1]
    parsed = [[c.strip() for c in r.strip().strip("|").split("|")] for r in rows]
    labels = [LABEL.match(c[0]) for c in parsed]
    hub = any(m and not any(c[1:]) for m, c in zip(labels, parsed))
    master = hub and next(m.group(1).strip() for m, c in zip(labels, parsed)
                          if m and not any(c[1:])) in MASTER_GROUPS
    problems += master_shape(parsed, labels) if master else shape(parsed, labels, hub)
    group = None
    for r, cells, m in zip(rows, parsed, labels):
        if hub and m and not any(cells[1:]) and len(cells) == 3:
            group = m.group(1).strip()
        if len(cells) != 3:
            problems.append("F2 row does not have 3 cells: " + r[:60])
            continue
        if hub and m and not any(cells[1:]):
            continue
        if TASK_NOISE.search(cells[0]):
            problems.append("F7 link, number, hash or path in Task: " + cells[0][:40])
        if not cells[2].startswith(EMOJI):
            problems.append("F2 Status does not start with a status emoji: " + cells[2][:40])
        elif master and group == "Main threads":
            if not COUNTS.search(cells[2]):
                problems.append("F13 main-thread row has no counts (<n> open, ...): " + cells[2][:40])
        elif not (cells[2].startswith("✅")
                  or re.search(r"\bdropped\b", cells[2], re.I) or ETA.search(cells[2])):
            problems.append("F12 open row has no ETA (~5 min, ~1 h, after X): " + cells[2][:40])

    tail = lines[last + 1:]
    fences = sum(1 for l in tail if l.strip().startswith("```"))
    blocks = fences // 2
    in_fence, prose = False, []
    for l in tail:
        if l.strip().startswith("```"):
            in_fence = not in_fence
        elif not in_fence and l.strip():
            prose.append(l)
    if blocks > 1:
        problems.append(f"F4 {blocks} code blocks under the table (max 1)")
    if blocks and prose:
        problems.append("F3 prose next to the command block: " + prose[0][:60])
    if len(prose) > 1:
        problems.append(f"F3 {len(prose)} lines of prose under the table (max 1 action line)")
    if prose and re.match(r"^\s*(\d+[.)]|[-*])\s", prose[0]) and len(prose) > 1:
        problems.append("F4 a list of steps instead of one next action")

    if PASTE.search(text):
        problems.append("F5 asks the user to paste output or report back")
    return problems


def shape(parsed, labels, hub):
    """F13: thread (leaf) = exactly 3 rows (✅ last, now, 👉/⏸ next); hub (main) = every row, grouped."""
    out = []
    if any(c and MORE.match(c[0]) for c in parsed):
        out.append("F13 '+N more' fold: show every row (hub) or use the 3 fixed rows (thread)")
    if not hub:
        if len(parsed) != 3:
            out.append(f"F13 {len(parsed)} data rows (a thread table has exactly 3: last finished, now, next)")
        status = [c[2] if len(c) == 3 else "" for c in parsed]
        if status and not status[0].startswith("✅"):
            out.append("F13 row 1 is not the last finished ✅ item")
        if len(status) > 1 and status[1].startswith("👉"):
            out.append("F13 row 2 is the current work, not the 👉 next step")
        if len(status) == 3 and not status[2].startswith(("👉", "⏸")):
            out.append("F13 row 3 (next step) is not 👉 or ⏸")
        return out
    group, seen = None, []
    for cells, m in zip(parsed, labels):
        if m and not any(cells[1:]):
            name = m.group(1).strip()
            if name not in GROUPS:
                out.append("F13 unknown hub group: " + name)
                group = None
                continue
            if seen and GROUPS.index(name) <= GROUPS.index(seen[-1]):
                out.append("F13 hub groups out of order (Needs you, Running, Waiting, Done)")
            seen.append(name)
            group = name
        elif group is None:
            out.append("F13 hub row outside a group: " + cells[0][:40])
        elif len(cells) == 3 and not cells[2].startswith(GROUP_EMOJI[group]):
            out.append(f"F13 row in {group} has the wrong status: " + cells[2][:40])
    return out


def master_shape(parsed, labels):
    """F13 master: Main threads rows (health + counts), then at most 5 Critical rows with owners."""
    out, group, seen, critical = [], None, [], 0
    for cells, m in zip(parsed, labels):
        if m and not any(cells[1:]):
            name = m.group(1).strip()
            if name not in MASTER_GROUPS:
                out.append("F13 unknown master group: " + name)
                group = None
                continue
            if seen and MASTER_GROUPS.index(name) <= MASTER_GROUPS.index(seen[-1]):
                out.append("F13 master groups out of order (Main threads, Critical)")
            seen.append(name)
            group = name
        elif group is None:
            out.append("F13 master row outside a group: " + cells[0][:40])
        elif group == "Critical" and len(cells) == 3:
            critical += 1
            if not cells[2].startswith(CRITICAL_EMOJI):
                out.append("F13 critical row is not 👉, ❌, ⚠️ or ⏸: " + cells[2][:40])
            if not OWNER.search(cells[2]):
                out.append("F13 critical row does not name its owning thread: " + cells[2][:40])
    if critical > 5:
        out.append(f"F13 {critical} critical rows (a master shows at most 5)")
    return out


def main(argv):
    text = open(argv[1]).read() if len(argv) > 1 else sys.stdin.read()
    problems = lint(text)
    for p in problems:
        print(p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
