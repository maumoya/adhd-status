#!/usr/bin/env python3
"""Optional Claude Code UserPromptSubmit hook: remind the agent to invoke adhd-status.

Skill descriptions are matched by the model, so in a long or compacted thread a plain "status"
can be answered without the skill. This hook makes the reminder deterministic: when the prompt
mentions status (or always, with --always), it adds one short line of context to the turn.
Standard library only; reads the hook JSON on stdin, prints the hook JSON on stdout.
"""
import json
import re
import sys

TRIGGER = re.compile(r"\bstatus\b|adhd|where are we|what'?s left|what do i do now", re.I)
REMINDER = (
    "adhd-status: invoke the adhd-status skill (Skill tool) before replying. "
    "The reply starts with the line | Task | Why | Status |, at most 4 rows, then at most one next action."
)


def reminder_for(prompt, always=False):
    if always or TRIGGER.search(prompt or ""):
        return REMINDER
    return None


def main(argv):
    try:
        event = json.load(sys.stdin)
    except ValueError:
        return 0
    text = reminder_for(event.get("prompt", ""), always="--always" in argv)
    if text:
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": text}}))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
