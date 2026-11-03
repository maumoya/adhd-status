#!/usr/bin/env python3
"""Optional Claude Code Stop hook: send a STATUS reply back once if it breaks the format.

After a turn whose prompt mentioned status, it lints the final reply with tools/lint_reply.py.
If the reply breaks a rule, it blocks the stop once with the list of problems, so the agent
rewrites the reply. It never blocks twice in a row (stop_hook_active) and never on other turns.
Standard library only; reads the hook JSON on stdin.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
from lint_reply import lint  # noqa: E402

STATUS = re.compile(r"\bstatus\b", re.I)


def _texts(content):
    if isinstance(content, str):
        return [content]
    return [p.get("text", "") for p in content or [] if isinstance(p, dict) and p.get("type") == "text"]


def last_turn(transcript_path):
    """Return (prompt, final reply) of the last turn in a Claude Code transcript (JSONL)."""
    prompt, final = "", []
    with open(transcript_path, errors="ignore") as f:
        for line in f:
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            msg = rec.get("message") or {}
            if rec.get("type") == "user":
                texts = [t for t in _texts(msg.get("content")) if t.strip() and not t.startswith("<")]
                if texts and not rec.get("isMeta"):
                    prompt, final = texts[-1], []
            elif rec.get("type") == "assistant":
                for part in msg.get("content") or []:
                    if not isinstance(part, dict):
                        continue
                    if part.get("type") == "tool_use":
                        final = []
                    elif part.get("type") == "text" and part.get("text", "").strip():
                        final.append(part["text"])
    return prompt, "\n".join(final)


def decide(event):
    if event.get("stop_hook_active"):
        return None
    path = event.get("transcript_path")
    if not path or not os.path.exists(path):
        return None
    prompt, reply = last_turn(path)
    if len(prompt) > 200 or not STATUS.search(prompt) or not reply.strip():
        return None
    problems = lint(reply)
    if not problems:
        return None
    return {
        "decision": "block",
        "reason": "adhd-status format: " + "; ".join(problems)
        + ". Rewrite the reply: table first, at most 4 rows, then at most one next action.",
    }


def main():
    try:
        event = json.load(sys.stdin)
    except ValueError:
        return 0
    out = decide(event)
    if out:
        print(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
