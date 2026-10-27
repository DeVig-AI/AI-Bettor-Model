"""The Research Lab scout bot (tools/scout_sources.py) on GitHub answers shaped like the real API (2026-10-27).

    python3 -m unittest discover -s tests/tools
"""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import scout_sources as SC  # noqa: E402

NOW = datetime(2026, 11, 1, 18, 17, tzinfo=timezone.utc)


class Scout(unittest.TestCase):
    def setUp(self):
        self.old = SC.DIR
        SC.DIR = Path(tempfile.mkdtemp())
        (SC.DIR / "SOURCES.yaml").write_text(
            "sources:\n- {id: a, repo: o/a, sport: NFL, what: A model., license: MIT}\n"
            "- {id: b, repo: o/b, sport: CFB, what: B model., license: none stated}\n")
        self.head = {"o/a": "a" * 40, "o/b": "b" * 40}

    def tearDown(self):
        SC.DIR = self.old

    def get(self, path):
        repo = "/".join(path.split("/")[2:4])
        if repo == "o/b" and "boom" in self.head["o/b"]:
            raise OSError("down")
        if path == f"/repos/{repo}":
            return {"default_branch": "main"}
        if path.startswith(f"/repos/{repo}/commits/"):
            return {"sha": self.head[repo]}
        if "/compare/" in path:
            return {"commits": [{"sha": "c" * 40, "commit": {"committer": {"date": "2026-10-30T12:00:00Z"},
                                                            "message": "Add rest adjustment\n\nlong body"}}],
                    "files": [{"filename": "model/rest.py"}, {"filename": "README.md"}]}
        raise AssertionError(path)

    def test_first_look_then_changes(self):
        SC.run(NOW, self.get)
        md = (SC.DIR / "WHATS_NEW.md").read_text()
        self.assertIn("first look", md)
        self.assertEqual(json.loads((SC.DIR / "STATE.json").read_text())["a"]["sha"], "a" * 40)
        self.head["o/a"] = "d" * 40                       # a new commit on o/a; o/b unchanged
        SC.run(NOW, self.get)
        md = (SC.DIR / "WHATS_NEW.md").read_text()
        self.assertIn("1 new commit(s)", md)
        self.assertIn("Add rest adjustment", md)
        self.assertNotIn("long body", md)                 # titles only
        self.assertIn("`model/rest.py`", md)
        self.assertIn("no change since last week", md)

    def test_one_source_down(self):
        self.head["o/b"] = "boom"
        SC.run(NOW, self.get)
        md = (SC.DIR / "WHATS_NEW.md").read_text()
        self.assertIn("could not check", md)
        self.assertIn("first look", md)                   # the other source still checked


if __name__ == "__main__":
    unittest.main()
