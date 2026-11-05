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
    if len(rows) > 4:
        problems.append(f"F2 {len(rows)} data rows (max 4)")
    for r in rows:
        cells = [c.strip() for c in r.strip().strip("|").split("|")]
        if len(cells) != 3:
            problems.append("F2 row does not have 3 cells: " + r[:60])
            continue
        if TASK_NOISE.search(cells[0]):
            problems.append("F7 link, number, hash or path in Task: " + cells[0][:40])
        if not cells[2].startswith(EMOJI):
            problems.append("F2 Status does not start with a status emoji: " + cells[2][:40])
        elif not (cells[2].startswith("✅") or MORE.match(cells[0])
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


def main(argv):
    text = open(argv[1]).read() if len(argv) > 1 else sys.stdin.read()
    problems = lint(text)
    for p in problems:
        print(p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
