"""tools/injuries_export.py: the college (Covers.com) and other-soccer-league (FotMob) injury lists, 2026-11-06. Parsing,
dates, name matching and the role scale, on fixtures only (no real rows).

    python3 -m unittest discover -s tests/tools
"""
import os
import sys
import unittest
from datetime import datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import injuries_export as I  # noqa: E402

PAGE = """<td class="covers-CoversSeasonInjuries-teamNameColumn"><div><a class="covers-CoversMatchups-imgLink" href="/x">
  Air Force<br><span>Falcons</span></a></div></td><table><tbody><tr><td>
  <span class='player-link'>
J.      Smith-Doe
  </span></td><td>WR</td>
  <td><b>Questionable - Undisclosed</b><br>(

Sun, Oct 18)</td></tr>
<tr><td><a href='/sport/basketball/ncaab/players/1/jalen-brown-jr' class='player-link' rel='nofollow'>J. Brown Jr.</a></td><td>G</td>
  <td><b>Out - Knee</b><br>(Wed, Oct 7)</td></tr></tbody></table>
<td class="covers-CoversSeasonInjuries-teamNameColumn"><a class="covers-CoversMatchups-imgLink" href="/y">Texas A&amp;M<br><span>Aggies</span></a>
No injuries to report."""


def player(pid, name, grp, **this):
    return {"id": pid, "name": name, "grp": grp, "this": {"gp": 8, **this}}


class College(unittest.TestCase):
    def test_covers_page(self):
        teams = I.covers_teams(PAGE)
        self.assertEqual([(t[0], t[1]) for t in teams], [("Air Force", "Falcons"), ("Texas A&M", "Aggies")])
        self.assertEqual(teams[0][2], [("J. Smith-Doe", None, "WR", "Questionable - Undisclosed", "Sun, Oct 18"),
                                       ("J. Brown Jr.", "jalen-brown-jr", "G", "Out - Knee", "Wed, Oct 7")])
        self.assertEqual(teams[1][2], [])

    def test_dates_fall_on_or_before_now(self):
        now = datetime(2026, 1, 10, tzinfo=I.ET)
        self.assertEqual(I.covers_date("Sun, Oct 18", now).year, 2025)
        self.assertEqual(I.covers_date("Fri, Jan 9", now).year, 2026)
        self.assertIsNone(I.covers_date("soon", now))

    def test_initials(self):
        self.assertTrue(I.initials_match("S. Maiava-Alaimalo", "Sylas Maiava-Alaimalo"))
        self.assertFalse(I.initials_match("S. Smith", "John Smith"))
        self.assertFalse(I.initials_match("Smith", "Sam Smith"))

    def test_cfb_scale(self):
        ps = [player("1", "Liam Quarter", "QB", att=30, rush_yds=20),
              player("2", "Bo Back", "RB", rush_yds=100),
              player("3", "Al Wide", "WR", rec_yds=30),
              player("4", "Lee Backer", "LB", tkl=8),
              player("5", "Dee End", "DL", tkl=1),
              player("6", "Ty Other", "WR", rec_yds=2)]
        stats = {"players": ps}
        self.assertEqual(I.cfb_impact(stats, "L. Quarter", "QB", "AF")[1]["level"], "big")
        self.assertEqual(I.cfb_impact(stats, "B. Back", "RB", "AF")[1]["level"], "big")       # 100 of 152 yards
        self.assertEqual(I.cfb_impact(stats, "A. Wide", "WR", "AF")[1]["level"], "some")      # 30 of 152
        self.assertEqual(I.cfb_impact(stats, "L. Backer", "LB", "AF")[1]["level"], "some")    # 8 of 9 tackles
        self.assertEqual(I.cfb_impact(stats, "T. Other", "WR", "AF")[1]["level"], "minor")
        name, imp = I.cfb_impact(stats, "Z. Nobody", "OL", "AF")
        self.assertIsNone(name)
        self.assertEqual(imp["level"], "minor")


class Soccer(unittest.TestCase):
    def test_fotmob_status(self):
        self.assertEqual(I.fotmob_status({"type": "suspension"})[0], "Suspended")
        self.assertEqual(I.fotmob_status({"type": "injury", "expectedReturn": "Doubtful"})[0], "Doubtful")
        self.assertEqual(I.fotmob_status({"type": "injury", "expectedReturn": "Late November 2026"}),
                         ("Out", "Injury · expected return: late November 2026"))

    def test_role_scale(self):
        dates = [f"2026-10-{d:02d}" for d in range(1, 11)]
        star = {"name": "Vinícius Júnior", "log": [[d, 1, 0, "LALIGA"] for d in dates]}
        sub = {"name": "Kid Bench", "log": [[d, 0, 0, "LALIGA"] for d in dates[:3]]}
        mid = {"name": "Mo Middle", "log": [[d, 1 if i < 2 else 0, 0, "LALIGA"] for i, d in enumerate(dates)]}
        stats = {"players": [star, sub, mid]}
        self.assertEqual(I.soccer_impact(I.soccer_role(stats, "Vinicius Junior"), "RMA")["level"], "big")
        self.assertEqual(I.soccer_impact(I.soccer_role(stats, "Kid Bench"), "RMA")["level"], "minor")
        self.assertEqual(I.soccer_impact(I.soccer_role(stats, "Mo Middle"), "RMA")["level"], "some")   # 2 of 12 goals
        self.assertEqual(I.soccer_impact(I.soccer_role(stats, "Nobody"), "RMA")["level"], "minor")
        self.assertIsNone(I.soccer_role({"players": [sub]}, "Kid Bench"))        # 3 matches: too few to say


if __name__ == "__main__":
    unittest.main()
