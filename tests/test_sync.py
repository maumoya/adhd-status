#!/usr/bin/env python3
"""Run: python3 -I tests/test_sync.py"""
import contextlib
import io
import json
import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "tools"))
import sync  # noqa: E402


def quiet(fn, *args):
    with contextlib.redirect_stdout(io.StringIO()):
        return fn(*args)


class SyncTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = pathlib.Path(self.tmp.name)
        (self.repo / "launch/templates").mkdir(parents=True)
        self.set_facts(freed="21%", runs="5/5")
        (self.repo / "launch/templates/card.svg").write_text("<svg><text>{{freed}} freed</text></svg>")
        (self.repo / "launch/assets.json").write_text(json.dumps([
            {"path": "assets/card.svg", "template": "launch/templates/card.svg", "uses": ["freed"]},
            {"path": "assets/demo.gif", "run": "echo gif > assets/demo.gif", "uses": ["runs"]},
            {"name": "Social preview", "outward": "upload assets/social.png", "uses": ["freed"]},
        ]))
        (self.repo / "README.md").write_text("Frees <!--fact:freed-->21%<!--/fact--> of the disk.\n")
        (self.repo / "llms.txt").write_text("Frees 21% of the disk.\n")

    def tearDown(self):
        self.tmp.cleanup()

    def set_facts(self, **kv):
        (self.repo / "launch/facts.json").write_text(
            json.dumps({k: {"value": v, "source": "test", "date": "2026-11-03"} for k, v in kv.items()}))

    def kinds(self):
        return {(k, w) for k, w, _ in sync.check(self.repo)}

    def first_sync(self):
        quiet(sync.apply, self.repo, True)
        sync.done(self.repo, "Social preview")

    def test_fresh_repo_needs_render_and_owner(self):
        self.assertIn(("STALE", "assets/card.svg"), self.kinds())
        self.assertIn(("STALE", "Social preview"), self.kinds())

    def test_after_full_sync_everything_is_in_sync(self):
        self.first_sync()
        self.assertEqual(sync.check(self.repo), [])
        self.assertEqual((self.repo / "assets/card.svg").read_text(), "<svg><text>21% freed</text></svg>")

    def test_changed_fact_flags_every_surface(self):
        self.first_sync()
        self.set_facts(freed="19%", runs="5/5")
        k = self.kinds()
        self.assertIn(("STALE", "assets/card.svg"), k)
        self.assertIn(("STALE", "Social preview"), k)
        self.assertIn(("DRIFT", "README.md"), k)
        self.assertIn(("LEFTOVER", "llms.txt:1"), k)
        self.assertNotIn(("STALE", "assets/demo.gif"), k)  # does not use the changed fact

    def test_apply_fixes_generated_but_keeps_flagging_handwritten(self):
        self.first_sync()
        self.set_facts(freed="19%", runs="5/5")
        quiet(sync.apply, self.repo, True)
        self.assertIn("19%", (self.repo / "README.md").read_text())
        self.assertIn("19% freed", (self.repo / "assets/card.svg").read_text())
        self.assertEqual(self.kinds(), {("LEFTOVER", "llms.txt:1"), ("STALE", "Social preview")})
        quiet(sync.apply, self.repo, True)  # a second apply must not forget the old value
        self.assertIn(("LEFTOVER", "llms.txt:1"), self.kinds())
        (self.repo / "llms.txt").write_text("Frees 19% of the disk.\n")
        sync.done(self.repo, "Social preview")
        quiet(sync.apply, self.repo, True)
        self.assertEqual(sync.check(self.repo), [])

    def test_no_outward_skips_owner_items(self):
        quiet(sync.apply, self.repo, True)
        self.assertIn(("STALE", "Social preview"), self.kinds())
        self.assertEqual(sync.check(self.repo, False), [])

    def test_generator_waits_for_run_flag(self):
        quiet(sync.apply, self.repo, False)
        self.assertFalse((self.repo / "assets/demo.gif").exists())
        self.assertIn(("STALE", "assets/demo.gif"), self.kinds())

    def test_scale_filter_draws_bars(self):
        self.assertEqual(sync.render('<rect width="{{p|scale:360}}"/>', {"p": "38%"}), '<rect width="137"/>')

    def test_unknown_fact_is_reported(self):
        (self.repo / "README.md").write_text("<!--fact:nope-->1<!--/fact-->\n")
        self.assertIn(("UNKNOWN FACT", "README.md"), self.kinds())

    def test_leftover_in_badge_url_and_changelog_is_history(self):
        self.set_facts(freed="21%", runs="98/100")
        self.first_sync()
        (self.repo / "README.md").write_text(
            "![a](https://img.shields.io/badge/freed%2021%25-x) ![b](https://img.shields.io/badge/score-98%2F100-green)\n")
        (self.repo / "llms.txt").write_text("nothing old here\n")
        (self.repo / "CHANGELOG.md").write_text("- 0.1: frees 21%, score 98/100\n")
        self.set_facts(freed="19%", runs="100/100")
        left = [w for k, w, _ in sync.check(self.repo) if k == "LEFTOVER"]
        self.assertEqual(left, ["README.md:1", "README.md:1"])

    def test_leftover_does_not_match_inside_bigger_numbers(self):
        self.first_sync()
        (self.repo / "llms.txt").write_text("121% and 21.5% are different numbers.\n")
        self.set_facts(freed="19%", runs="5/5")
        self.assertFalse(any(k == "LEFTOVER" for k, _ in self.kinds()))

    def test_keep_txt_files_are_left_alone(self):
        (self.repo / "tests").mkdir()
        (self.repo / "tests/t.py").write_text("<!--fact:nope-->1<!--/fact--> <!--fact:freed-->0<!--/fact-->\n")
        (self.repo / "launch/keep.txt").write_text("tests/*.py\n")
        self.first_sync()
        self.assertEqual(sync.check(self.repo), [])
        self.assertIn("freed-->0<", (self.repo / "tests/t.py").read_text())


if __name__ == "__main__":
    unittest.main()
