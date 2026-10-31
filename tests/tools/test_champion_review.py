"""CHAMPION_CHALLENGER_V1 (tools/champion_review.py): locks, entry, trial keep / remove, on made-up games (2026-10-30).

    python3 -m unittest discover -s tests/tools
"""
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import champion_review as CR  # noqa: E402

T0 = datetime(2026, 11, 1, 0, 0, tzinfo=timezone.utc)
REG = "2026-10-30"


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def world(n, champ_p, chall_p, slot="NBA.ml", chall="blotny", champ="devig", start=T0, home_ml=-150.0, away_ml=130.0):
    """n graded games, home team always wins, one a day from `start`. champ_p / chall_p: functions of the game index
    giving each model's home win chance at DeVig's (only) lock."""
    sport = slot.split(".")[0]
    locks, picks, results = [], [], []
    for i in range(n):
        gid = f"g{i}"
        kick = start + timedelta(days=i)
        ref = iso(kick - timedelta(hours=8))
        for model, p in ((champ, champ_p(i)), (chall, chall_p(i))):
            locks.append({"logged_at": ref, "slot": slot, "game_id": gid, "kickoff": iso(kick), "model": model,
                          "role": "", "home_wp": str(p), "champion_lock_at": ref})
        picks.append({"sport": sport, "game_id": gid, "model": "devig", "at": ref})
        picks.append({"sport": sport, "game_id": gid, "model": "kalshi", "home_ml": home_ml, "away_ml": away_ml})
        results.append({"sport": sport, "game_id": gid, "home_score": 100, "away_score": 90})
    return locks, picks, results


def state(slot="NBA.ml", champ="devig", app_support=True, trial=None, hold=None):
    s = {"champion": champ, "since": "2026-10-19T00:00:00Z", "app_support": app_support, "trial": trial, "retired": []}
    if hold:
        s["hold"] = hold
    return {"rule": "x", "slots": {slot: s}}


REGS = {"NBA.ml": [{"id": "blotny", "slot": "NBA.ml", "source": "blotny", "license": "MIT", "registered": REG}]}


class Measures(unittest.TestCase):
    def test_log_loss_is_clipped(self):
        self.assertAlmostEqual(CR.log_loss(1.0, True), -__import__("math").log(0.99))
        self.assertAlmostEqual(CR.log_loss(0.7, False), -__import__("math").log(0.3))

    def test_profit_follows_the_favoured_side(self):
        self.assertAlmostEqual(CR.profit(0.6, True, -150, 130), 100 / 150)
        self.assertEqual(CR.profit(0.6, False, -150, 130), -1.0)
        self.assertAlmostEqual(CR.profit(0.4, False, -150, 130), 1.3)
        self.assertEqual(CR.profit(0.5, True, -150, 130), 0.0)
        self.assertIsNone(CR.profit(0.6, True, None, 130))

    def test_quarters_cover_every_game(self):
        q = CR.quarters(list(range(150)))
        self.assertEqual([len(x) for x in q], [37, 37, 37, 39])

    def test_tiers(self):
        ps = [{"pa": 0.5 + i / 200, "home_won": True} for i in range(100)]
        t = CR.tiers(ps)
        self.assertAlmostEqual(t["top25"], 0.5 + 74.25 / 200, places=3)
        self.assertEqual(t["acc_top25"], 1.0)


class Locks(unittest.TestCase):
    def latest(self, kick, devig_at):
        picks = {"kalshi": {"home_ml": -150.0, "away_ml": 130.0}, "blotny": {"home_wp": 0.61}}
        if devig_at:
            picks["devig"] = {"home_wp": 0.58, "at": devig_at}
        return {"games": {"NBA:1": {"sport": "NBA", "game_id": "1", "kickoff": iso(kick), "picks": picks}}}

    def test_every_model_locked_at_devig_lock_and_again_after_a_relock(self):
        kick = T0 + timedelta(days=2)
        seen = set()
        rows = CR.lock_step(T0, state(), REGS, self.latest(kick, iso(T0 - timedelta(hours=1))), seen)
        self.assertEqual({r["model"] for r in rows}, {"devig", "blotny", "market"})
        self.assertEqual(CR.lock_step(T0, state(), REGS, self.latest(kick, iso(T0 - timedelta(hours=1))), seen), [])
        later = T0 + timedelta(days=1)
        again = CR.lock_step(later, state(), REGS, self.latest(kick, iso(later - timedelta(minutes=5))), seen)
        self.assertEqual(len(again), 3)

    def test_nothing_before_devig_locks_or_after_the_start(self):
        self.assertEqual(CR.lock_step(T0, state(), REGS, self.latest(T0 + timedelta(days=1), None), set()), [])
        self.assertEqual(CR.lock_step(T0, state(), REGS, self.latest(T0 - timedelta(hours=1), iso(T0)), set()), [])

    def test_college_locks_six_hours_before_the_start(self):
        st = state(slot="CFB.ml", champ="market", app_support=False)
        regs = {"CFB.ml": [{"source": "cfbrank"}]}
        kick = T0 + timedelta(hours=7)
        g = {"games": {"CFB:9": {"sport": "CFB", "game_id": "9", "kickoff": iso(kick),
                                 "picks": {"cfbrank": {"home_wp": 0.4}, "kalshi": {"home_ml": 120.0, "away_ml": -140.0}}}}}
        self.assertEqual(CR.lock_step(T0, st, regs, g, set()), [])
        rows = CR.lock_step(T0 + timedelta(hours=2), st, regs, g, set())
        self.assertEqual({r["model"] for r in rows}, {"cfbrank", "market"})

    def test_only_the_last_devig_lock_counts(self):
        locks, picks, results = world(1, lambda i: 0.6, lambda i: 0.9)
        old = dict(locks[1], home_wp="0.1", champion_lock_at="2026-10-01T00:00:00Z")
        ps = CR.pairs("NBA.ml", "blotny", "devig", T0, [old] + locks, picks, results)
        self.assertEqual(len(ps), 1)
        self.assertEqual(ps[0]["pa"], 0.9)


class Entry(unittest.TestCase):
    def run_review(self, locks, picks, results, st, decided=None):
        return CR.review(T0 + timedelta(days=400), st, REGS, locks, picks, results, set() if decided is None else decided)

    def test_not_before_300_games(self):
        st = state()
        out, prog = self.run_review(*world(299, lambda i: 0.55, lambda i: 0.8), st)
        self.assertEqual(out, [])
        self.assertIsNone(st["slots"]["NBA.ml"]["trial"])
        self.assertEqual(prog["NBA.ml"]["challengers"][0]["games"], 299)

    def test_enters_when_more_accurate_and_no_worse_on_profit(self):
        st = state()
        out, _ = self.run_review(*world(300, lambda i: 0.55, lambda i: 0.8), st)
        self.assertEqual([d["action"] for d in out], ["enter"])
        t = st["slots"]["NBA.ml"]["trial"]
        self.assertEqual((t["challenger"], t["previous"], t["target"]), ("blotny", "devig", 150))
        self.assertEqual(st["slots"]["NBA.ml"]["champion"], "devig")       # the champion is only replaced in the app

    def test_less_accurate_never_enters(self):
        st = state()
        out, _ = self.run_review(*world(400, lambda i: 0.8, lambda i: 0.55), st)
        self.assertEqual(out, [])

    def test_more_accurate_but_less_profit_never_enters(self):
        st = state()
        # the challenger is far surer on 90% of games but on the other 10% leans the wrong way
        out, _ = self.run_review(*world(400, lambda i: 0.55, lambda i: 0.45 if i % 10 == 0 else 0.9), st)
        self.assertEqual(out, [])

    def test_no_app_support_logs_eligible_once(self):
        st = state(app_support=False)
        decided = set()
        out, _ = self.run_review(*world(300, lambda i: 0.55, lambda i: 0.8), st, decided)
        self.assertEqual([d["action"] for d in out], ["eligible"])
        self.assertIsNone(st["slots"]["NBA.ml"]["trial"])
        again, _ = self.run_review(*world(300, lambda i: 0.55, lambda i: 0.8), st, decided)
        self.assertEqual(again, [])

    def test_held_slot_is_not_checked(self):
        st = state(hold="Model 2.0 review")
        out, prog = self.run_review(*world(300, lambda i: 0.55, lambda i: 0.8), st)
        self.assertEqual(out, [])
        self.assertEqual(prog["NBA.ml"]["hold"], "Model 2.0 review")


class Trial(unittest.TestCase):
    def trial_state(self):
        return state(trial={"challenger": "blotny", "start": iso(T0), "previous": "devig", "target": 150,
                            "tiers": {"top25": 0.7, "top50": 0.6}})

    def test_waits_for_the_trial_length(self):
        st = self.trial_state()
        out, prog = CR.review(T0 + timedelta(days=400), st, REGS, *world(149, lambda i: 0.55, lambda i: 0.8), set())
        self.assertEqual(out, [])
        self.assertEqual(prog["NBA.ml"]["trial"]["games"], 149)

    def test_kept_when_better_in_every_quarter(self):
        st = self.trial_state()
        out, _ = CR.review(T0 + timedelta(days=400), st, REGS, *world(150, lambda i: 0.55, lambda i: 0.8), set())
        self.assertEqual([d["action"] for d in out], ["keep"])
        s = st["slots"]["NBA.ml"]
        self.assertEqual((s["champion"], s["trial"]), ("blotny", None))

    def test_removed_when_behind_in_one_quarter(self):
        st = self.trial_state()
        # last quarter (games 111-149): the challenger is the less sure one
        out, _ = CR.review(T0 + timedelta(days=400), st, REGS,
                           *world(150, lambda i: 0.55 if i < 111 else 0.9, lambda i: 0.8), set())
        self.assertEqual([d["action"] for d in out], ["remove"])
        s = st["slots"]["NBA.ml"]
        self.assertEqual((s["champion"], s["trial"]), ("devig", None))
        self.assertEqual(s["retired"][0]["id"], "blotny")

    def test_removed_when_profit_is_lower(self):
        st = self.trial_state()
        out, _ = CR.review(T0 + timedelta(days=400), st, REGS,
                           *world(150, lambda i: 0.55, lambda i: 0.45 if i % 10 == 0 else 0.9), set())
        self.assertEqual(out[0]["action"], "remove")
        self.assertIn("lower profit", out[0]["detail"])

    def test_removed_challenger_waits_for_next_season(self):
        st = self.trial_state()
        now = T0 + timedelta(days=200)
        CR.review(now, st, REGS, *world(150, lambda i: 0.55 if i < 111 else 0.9, lambda i: 0.8), set())
        out, _ = CR.review(now + timedelta(days=1), st, REGS, *world(300, lambda i: 0.55, lambda i: 0.8), set())
        self.assertEqual(out, [])


if __name__ == "__main__":
    unittest.main()
