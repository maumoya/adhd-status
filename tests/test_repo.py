"""Free checks that run in CI: reply linter, hooks, eval folders, skill metadata."""
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.path.insert(0, os.path.join(ROOT, "hooks"))

from lint_reply import lint  # noqa: E402
import status_lint_stop  # noqa: E402
import status_reminder  # noqa: E402

FIXTURES = os.path.join(ROOT, "tests", "fixtures")


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return f.read()


class LintReply(unittest.TestCase):
    def test_bad_replies_fail_with_their_rule(self):
        bad = os.path.join(FIXTURES, "bad")
        for name in sorted(os.listdir(bad)):
            rule = name.split("-")[0]
            with self.subTest(name):
                problems = lint(read("tests", "fixtures", "bad", name))
                self.assertTrue(any(p.startswith(rule) for p in problems), problems)

    def test_good_replies_pass(self):
        for name in sorted(os.listdir(os.path.join(FIXTURES, "good"))):
            with self.subTest(name):
                self.assertEqual(lint(read("tests", "fixtures", "good", name)), [])

    def test_skill_example_passes(self):
        skill = read("skills", "adhd-status", "SKILL.md")
        good = skill.split("Good:", 1)[1].split("## ", 1)[0]
        self.assertEqual(lint(good), [])


class Hooks(unittest.TestCase):
    def test_reminder_triggers(self):
        for prompt in ["STATUS", "ok cool, status + next step", "where are we?", "/adhd-status"]:
            self.assertIsNotNone(status_reminder.reminder_for(prompt), prompt)
        self.assertIsNone(status_reminder.reminder_for("fix the login bug"))
        self.assertIsNotNone(status_reminder.reminder_for("fix the login bug", always=True))

    def test_reminder_output_shape(self):
        out = subprocess.run(
            [sys.executable, "-I", os.path.join(ROOT, "hooks", "status_reminder.py")],
            input=json.dumps({"prompt": "status?"}), capture_output=True, text=True, check=True,
        ).stdout
        self.assertEqual(json.loads(out)["hookSpecificOutput"]["hookEventName"], "UserPromptSubmit")

    def _transcript(self, prompt, reply, after=()):
        recs = [
            {"type": "user", "message": {"role": "user", "content": prompt}},
            {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Skill", "input": {}}]}},
            {"type": "assistant", "message": {"content": [{"type": "text", "text": reply}]}},
            *after,
        ]
        f = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False)
        f.write("\n".join(json.dumps(r) for r in recs))
        f.close()
        self.addCleanup(os.unlink, f.name)
        return f.name

    def test_stop_hook_blocks_bad_status_reply_once(self):
        bad = read("tests", "fixtures", "bad", "F3-summary-first.md")
        path = self._transcript("status", bad)
        out = status_lint_stop.decide({"transcript_path": path})
        self.assertEqual(out["decision"], "block")
        self.assertIn("F3", out["reason"])
        self.assertIsNone(status_lint_stop.decide({"transcript_path": path, "stop_hook_active": True}))

    def test_stop_hook_passes_good_reply_and_other_turns(self):
        good = read("tests", "fixtures", "good", "command.md")
        self.assertIsNone(status_lint_stop.decide({"transcript_path": self._transcript("STATUS", good)}))
        prose = "Fixed the bug."
        self.assertIsNone(status_lint_stop.decide({"transcript_path": self._transcript("fix the bug", prose)}))

    def test_stop_hook_skips_turns_the_user_did_not_type(self):
        good = read("tests", "fixtures", "good", "command.md")
        note = "<task-notification>\n<task-id>a1</task-id>\n</task-notification>"
        line = {"type": "assistant", "message": {"content": [{"type": "text", "text": "Cleanup still running."}]}}
        for rec in (
            {"type": "user", "message": {"role": "user", "content": note}},
            {"type": "attachment", "attachment": {"type": "queued_command", "prompt": note,
                                                  "commandMode": "task-notification"}},
        ):
            with self.subTest(rec["type"]):
                path = self._transcript("status", good, after=[rec, line])
                self.assertIsNone(status_lint_stop.decide({"transcript_path": path}))


class Repo(unittest.TestCase):
    def test_every_failure_has_an_eval(self):
        doc = read("docs", "FAILURES.md")
        rows = re.findall(r"^\| (F\d+) \|[^|]+\| ([^|]+) \|", doc, re.M)
        self.assertEqual([r[0] for r in rows], [f"F{i}" for i in range(1, 15)])
        for fid, evals in rows:
            names = re.findall(r"`([\w-]+)`", evals)
            self.assertTrue(names, fid)
            for name in names:
                with self.subTest(fid=fid, eval=name):
                    self.assertTrue(os.path.isdir(os.path.join(ROOT, "evals", name)))

    def test_eval_folders_are_complete(self):
        for name in sorted(os.listdir(os.path.join(ROOT, "evals"))):
            if name == "results":  # local eval reports (gitignored)
                continue
            base = os.path.join(ROOT, "evals", name)
            with self.subTest(name):
                case = read("evals", name, "case.yaml")
                self.assertIn(f"name: {name}\n", case)
                self.assertTrue(read("evals", name, "prompt.md").startswith("---\ntags: [adhd-status]"))
                self.assertTrue(os.listdir(os.path.join(base, "graders")))
                if "scaffold_script" in case:
                    self.assertTrue(os.path.isfile(os.path.join(base, "place-files.sh")))

    def test_skill_metadata(self):
        skill = read("skills", "adhd-status", "SKILL.md")
        desc = re.search(r"^description: (.*)$", skill, re.M).group(1)
        self.assertLessEqual(len(desc), 1024)
        self.assertIn("status", desc.lower())
        plugin = json.loads(read(".claude-plugin", "plugin.json"))
        self.assertRegex(plugin["version"], r"^\d+\.\d+\.\d+$")
        json.loads(read(".claude-plugin", "marketplace.json"))


if __name__ == "__main__":
    unittest.main()
