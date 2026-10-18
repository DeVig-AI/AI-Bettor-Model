#!/usr/bin/env python3
"""NFL_WEATHER_TOTALS_LIVE_V2 -- the weather/totals live test, priced on Kalshi (see NFL_WEATHER_TOTALS_LIVE_V2_PREREG.md).

V1 (Pinnacle prices from The Odds API) ended 2026-10-18 with its results kept in WEATHER_TOTALS_LIVE_V1.sqlite3.
V2 runs the SAME frozen model file and the same pick rule; only the price source changes: Kalshi's public NFL total
market (KXNFLTOTAL, no key, no account), at the rung closest to even money. Monitoring only: never places bets.

Commands:
  snapshot  Log every NFL game starting in the next 3.5h (pick / pass / skip).
  grade     Grade logged picks whose games are final.
"""
import argparse, datetime as dt, json, sys

import nfl_weather_totals_live_v1 as W     # frozen model, features, ESPN, open-meteo, grading (unchanged)
import kalshi_games_v1 as K

DB_PATH = W.os.path.join(W.HERE, "WEATHER_TOTALS_LIVE_V2.sqlite3")
MODEL_SHA = "588945bd0e37bc265f23776d7f015901e33f3c5827ff99900f09f0f62c14f8a5"   # V1 Amendment 1 refit
PREREG_SHA = "dbb498d2215eb9089e9915d4edb626bd27d1e1139f2eff715ac95d9c208fb16c"
W.DB_PATH, W.PREREG_SHA = DB_PATH, PREREG_SHA   # every shared helper below writes the V2 database


def kalshi_totals():
    """{espn_game_id: {"line", "over", "under", "ticker_event"}} from Kalshi's open NFL games."""
    out = {}
    for g in K.kalshi_games("NFL").values():
        e = K.match_espn("NFL", g)
        t = K.main_total(g) if e else None
        if t and None not in t:
            out[str(e["espn_id"])] = {"line": t[0], "over": t[1], "under": t[2], "event": g["event"]}
    return out


def price_game(m, g, tot, geo_conn):
    """The V1 pick logic at Kalshi's price. Returns the fields to store (pick may be SKIP with skip_reason)."""
    reason = wind = temp = None
    rec = {}
    if tot is None:
        reason = "no Kalshi total"
    elif g["indoor"] is None:
        reason = "ESPN indoor flag missing"
    if reason is None and not g["indoor"]:
        ll = W.geocode(geo_conn, g["city"], g["state"], g["country"]) if g["city"] else None
        if ll is None:
            reason = "venue city not geocoded"
        else:
            rec["lat"], rec["lon"] = ll
            wind, temp = W.forecast(ll[0], ll[1], g["kickoff"])
            if wind is None:
                reason = "no forecast hour near kickoff"
    if reason is not None:
        rec.update({"pick": "SKIP", "skip_reason": reason})
        return rec
    po, pu = 1 / W.dec(tot["over"]), 1 / W.dec(tot["under"])
    q = po / (po + pu)
    p = W.p_over(m, W.features(q, tot["line"], bool(g["indoor"]), wind, temp))
    ev_o = p * (W.dec(tot["over"]) - 1) - (1 - p)
    ev_u = (1 - p) * (W.dec(tot["under"]) - 1) - p
    pick = ("OVER" if ev_o >= ev_u else "UNDER") if max(ev_o, ev_u) >= W.EV_MIN else "PASS"
    rec.update({"wind_mph": wind, "temp_f": temp, "total_line": tot["line"], "over_odds": tot["over"],
                "under_odds": tot["under"], "q_over": q, "p_over": p, "ev_over": ev_o, "ev_under": ev_u, "pick": pick,
                "pick_odds": tot["over"] if pick == "OVER" else tot["under"] if pick == "UNDER" else None,
                "user_books_json": json.dumps({"kalshi": dict(tot)}, sort_keys=True)})
    return rec


def cmd_snapshot(args):
    m = W.load_model()
    sha = W.file_sha(W.MODEL_PATH)
    if sha != MODEL_SHA:
        raise SystemExit("Frozen model file changed (%s); stopping." % sha[:8])
    c = W.db()
    W.check_model_frozen(c, sha)
    now = W.utcnow()
    horizon = now + dt.timedelta(hours=W.WINDOW_H)
    dates = sorted({(now + dt.timedelta(hours=h)).strftime("%Y%m%d") for h in (-6, 0, W.WINDOW_H)})
    todo = []
    for g in (W.espn_info(e) for e in W.espn_events(dates)):
        if not (now < g["kickoff"] <= horizon):
            continue
        row = c.execute("SELECT pick FROM games WHERE game_id=?", (g["game_id"],)).fetchone()
        if row and row[0] != "SKIP":
            continue  # first real snapshot is the locked one
        todo.append(g)
    if not todo:
        c.execute("INSERT INTO runlog VALUES (?,?,?)", (W.iso(now), "snapshot", "no games in window"))
        c.commit(); print("snapshot: no games in window"); return 0
    totals = kalshi_totals()
    n = {"OVER": 0, "UNDER": 0, "PASS": 0, "SKIP": 0}
    for g in todo:
        rec = {"game_id": g["game_id"], "snapshot_utc": W.iso(now), "kickoff_utc": W.iso(g["kickoff"]),
               "season": g["season"], "week": g["week"], "home": g["home"], "away": g["away"],
               "venue": g["venue"], "city": g["city"], "state": g["state"],
               "indoor": None if g["indoor"] is None else int(bool(g["indoor"])), "model_sha": sha}
        rec.update(price_game(m, g, totals.get(str(g["game_id"])), c))
        n[rec["pick"]] += 1
        c.execute("INSERT OR REPLACE INTO games (%s) VALUES (%s)" % (",".join(rec), ",".join("?" * len(rec))),
                  list(rec.values()))
    c.execute("INSERT INTO runlog VALUES (?,?,?)", (W.iso(now), "snapshot", json.dumps(n)))
    c.commit()
    print("snapshot:", n, "| Kalshi notes:", K.log[:5])
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["snapshot", "grade"])
    a = ap.parse_args()
    return cmd_snapshot(a) if a.cmd == "snapshot" else W.cmd_grade(a)


if __name__ == "__main__":
    sys.exit(main())
