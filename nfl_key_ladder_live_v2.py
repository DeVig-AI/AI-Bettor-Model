#!/usr/bin/env python3
"""nfl_key_ladder_live_v2.py -- KEY_LADDER_LIVE_V2 (see KEY_LADDER_LIVE_V2_PREREG.md). Monitoring only, never bets.

V1 (DraftKings / Hard Rock / Pinnacle ladders from The Odds API) ended 2026-10-18 with its results kept in
KEY_LADDER_LIVE_V1.sqlite3. V2 prices Kalshi's public NFL spread ladder (KXNFLSPREAD, "<team> wins by over X
points", no key, no account) against the SAME frozen fair table, tiers and one-official-bet rule. Each Kalshi
rung gives two prices: YES = the team at -X (ask + fee), NO = the other team at +X (1 - bid + fee).

  snapshot : log ladders for games starting within --hours
  grade    : fill results from ESPN's scoreboard for finished games (V1's grader, on the V2 database)
"""
import argparse, datetime as dt, json, os

import nfl_key_ladder_live_v1 as KL     # frozen table check, cover stats, EV, key crossings, grading (unchanged)
import kalshi_games_v1 as K

W = KL.W
DB_PATH = os.path.join(KL.HERE, "KEY_LADDER_LIVE_V2.sqlite3")
PREREG_SHA = "196e1579a0f6d4f66ead4918470cc5e30d199df5ccb6831e388787d5f5c5bb74"
KL.DB_PATH = DB_PATH        # KL.db() and KL.cmd_grade use the V2 database
BOOK = "kalshi"


def kalshi_ladder(g, a, h, names):
    """{(team_name, point): american} from the Kalshi spread ladder. Whole-number strikes are left out: on Kalshi a
    margin equal to the strike settles NO instead of pushing, which the fair table does not price."""
    out = {}
    for q in g["spreads"]:
        if q["bid"] is None or q["ask"] is None or not (0 < q["bid"] < q["ask"] < 1) or q["line"] % 1 != 0.5:
            continue
        team, opp = names[q["team"]], names[a if q["team"] == h else h]
        yes, no = K.american(q["ask"]), K.american(round(1 - q["bid"], 4))
        if yes is not None:
            out[(team, -q["line"])] = yes
        if no is not None:
            out[(opp, q["line"])] = no
    return out


def cmd_snapshot(a):
    table = KL.load_table()
    c = KL.db()
    c.execute("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)")
    c.execute("INSERT OR IGNORE INTO meta VALUES ('prereg_sha', ?)", (PREREG_SHA,))
    now = W.utcnow()
    end = now + dt.timedelta(hours=a.hours)
    tally = {"HIGH": 0, "MEDIUM": 0, "LEAN": 0, "games": 0}
    for g in K.kalshi_games("NFL").values():
        e = K.match_espn("NFL", g)
        if not e:
            continue
        ko = dt.datetime.fromisoformat(e["kickoff"].replace("Z", "+00:00"))
        eid = str(e["espn_id"])
        if not (now < ko <= end) or c.execute("SELECT 1 FROM games WHERE event_id=?", (eid,)).fetchone():
            continue
        ka, kh = (g["home_code"], g["away_code"]) if e.get("swapped") else (g["away_code"], g["home_code"])
        home, away = e["home_name"], e["away_name"]
        names = {kh: home, ka: away}
        sp = K.main_spread(g, ka, kh)
        main = sp[0] if sp else None
        s_home = -main if main is not None else None
        rows, priced = [], 0
        for (team, pt), price in (kalshi_ladder(g, ka, kh, names) if main is not None else {}).items():
            is_home = team == home
            main_pt = main if is_home else -main
            if abs(pt - main_pt) > KL.MAX_DIST:
                continue
            st = KL.cover_stats(table, s_home, is_home, pt)
            if st is None:
                continue
            priced += 1
            d = KL.dec(price)
            ev, ev_low = KL.ev_of(st["p"], st["push"], d), KL.ev_of(st["lo"], st["push"], d)
            tier = "HIGH" if ev_low >= 0 else "MEDIUM" if ev >= 0.03 else "LEAN" if ev >= 0.01 else None
            if tier is None:
                continue
            rows.append({"event_id": eid, "snapshot_utc": W.iso(now), "kickoff_utc": W.iso(ko), "home": home,
                         "away": away, "main_home_point": main, "book": BOOK, "team": team, "point": pt,
                         "price_american": price, "p_cover": st["p"], "p_low": st["lo"], "p_high": st["hi"],
                         "p_push": st["push"], "n": st["n"], "ev": ev, "ev_low": ev_low, "pin_agree": None,
                         "crosses": KL.crosses(main_pt, pt), "tier": tier, "official": 0})
        cands = [r for r in rows if r["tier"] in ("HIGH", "MEDIUM")]
        if cands:
            max(cands, key=lambda r: (r["tier"] == "HIGH", r["ev"]))["official"] = 1
        for r in rows:
            c.execute("INSERT OR REPLACE INTO rungs (%s) VALUES (%s)" % (",".join(r), ",".join("?" * len(r))),
                      list(r.values()))
            tally[r["tier"]] += 1
        c.execute("INSERT OR REPLACE INTO games VALUES (?,?,?,?,?,?,?,?,?)",
                  (eid, W.iso(now), W.iso(ko), home, away, main, priced, len(rows),
                   None if main is not None else "no Kalshi main spread"))
        tally["games"] += 1
    c.execute("INSERT INTO runlog VALUES (?,?,?)", (W.iso(now), "snapshot", json.dumps(tally)))
    c.commit()
    print("snapshot:", tally, "| Kalshi notes:", K.log[:5])
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["snapshot", "grade"])
    ap.add_argument("--hours", type=float, default=36.0)
    a = ap.parse_args()
    raise SystemExit(cmd_snapshot(a) if a.cmd == "snapshot" else KL.cmd_grade(a))
