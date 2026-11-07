#!/usr/bin/env python3
"""
nba_props_model_v3_live.py -- NBA_PROPS_MODEL_V3_LIVE (nba/NBA_PROPS_MODEL_V3_LIVE_PREREG.md, owner's decision
2026-11-06): the frozen NBA prop model v3 (nba/nba_props_model_v3_T2027.json.gz, v3's own inputs from
nba/nba_props_live_features_v3.py) becomes the app's NBA props model. Same lock moment, filters, pick rule and
grading as the v2 live test (nba/nba_props_model_v2_live.py, frozen, used read-only: its prices, box scores, rosters,
injury report, name matching, scoring loop and grading are called unchanged, with v3's model and inputs in place of
v2's). Its own append-only paper log nba/NBA_PROPS_MODEL_V3_LOG.sqlite3 (same tables as v2's) and the app export
nba/props_model_export.json, written after v2's run so the app reads v3. Nothing is bet. Not proven.

Run from the repo root (GitHub Actions, after nba_props_model_v2_live.py):  python3 nba/nba_props_model_v3_live.py [--dry-run]
"""
import argparse, hashlib, json, os, sys
from datetime import timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nba_props_model_v2_live as V2  # noqa: E402  (frozen; read-only use)
import nba_props_fit_v3 as F3  # noqa: E402
import nba_props_live_features_v3 as LF3  # noqa: E402

DOC = "NBA_PROPS_MODEL_V3"
TARGET = 2027
MODEL = F3.out_path(TARGET)
PREREG = os.path.join(HERE, "NBA_PROPS_MODEL_V3_LIVE_PREREG.md")
DB = os.path.join(HERE, "NBA_PROPS_MODEL_V3_LOG.sqlite3")
OUT = V2.OUT
# information only: the v3 back-test's blend of Kalshi's mid and v3 (NBA_PROPS_MODEL_V3_SHADOW_PREREG.md)
BLEND = (-0.0412, 0.7737, 0.2177)


class _V3Model:
    """What V2.score_games calls as F: v3's frozen model and its chance of the over."""
    load = staticmethod(F3.load)
    p_over = staticmethod(F3.p_over)


class _V3Inputs:
    """What V2.score_games calls as LF: v3's live inputs (v2's plus v3's), for the current season."""
    season = None

    @classmethod
    def live_features(cls, box, games, out_ids, rosters=None):
        return LF3.live_features(box, games, out_ids, rosters, cls.season)


def use_v3(t0):
    """Point v2's scorer at v3. Only module attributes change in this process; v2's file is untouched."""
    _V3Inputs.season = V2.season_now(t0)
    V2.F, V2.LF, V2.TARGET, V2.BLEND = _V3Model, _V3Inputs, TARGET, BLEND


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    t0 = V2.now_utc()
    use_v3(t0)
    prereg_sha = V2.sha(PREREG) if os.path.exists(PREREG) else None
    prices = json.load(open(V2.PRICES))
    scored = V2.score_games(t0, prices)
    pick_ok = V2.pick_ok
    summary = {"games": len(scored), "rows": sum(len(v["rows"]) for v in scored.values()),
               "rows_scored": sum(o["model_p"] is not None for v in scored.values() for o in v["rows"]),
               "pick_eligible": sum(pick_ok(o) for v in scored.values() for o in v["rows"]),
               "locked_now": [], "picks_now": 0}
    if a.dry_run:
        for key, v in scored.items():
            ok = [o for o in v["rows"] if pick_ok(o)]
            evs = [max(o.get("ev_over", -1), o.get("ev_under", -1)) for o in ok]
            print(key, "rows", len(v["rows"]), "scored", sum(o["model_p"] is not None for o in v["rows"]),
                  "eligible", len(ok), "ev>=0.05", sum(e >= V2.MIN_EDGE for e in evs))
        print(json.dumps(summary, indent=1))
        return
    V2.DB = DB                                   # v2's tables and append-only triggers, in v3's own log
    c = V2.db()
    c.execute("INSERT OR IGNORE INTO runs VALUES (?,?,?,?,?)", (V2.iso(t0), prereg_sha, V2.sha(MODEL),
                                                                 prices.get("generated_at"),
                                                                 "" if prereg_sha else "NO PREREG FILE -- nothing locked"))
    locked = {r[0] for r in c.execute("SELECT game_key FROM locked_games")}
    docs = []
    for key, v in scored.items():
        gm, rows_out = v["game"], v["rows"]
        kt = gm["kick"]
        in_window = kt - timedelta(hours=V2.LOCK_WINDOW_START_H) <= t0 <= kt - timedelta(minutes=V2.LOCK_WINDOW_END_MIN)
        if prereg_sha and in_window and key not in locked:
            n_rows, best = 0, {}
            for o in rows_out:
                k = o["k"]
                if o["model_p"] is None or k.get("ask") is None or k.get("bid") is None:
                    continue
                c.execute("INSERT OR IGNORE INTO locked_rows VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                          (key, o["player"], o["pid"], o["stat"], o["line"], o["model_p"], o["expected"],
                           o.get("blend_p"), o["n_games"], o["days_since"], o["n_out"], o["injury"] or "",
                           k.get("bid"), k.get("ask"), k.get("oi"), k.get("t"), k.get("e"), V2.iso(t0)))
                n_rows += 1
                if not pick_ok(o):
                    continue
                for side, ev in (("OVER", o.get("ev_over")), ("UNDER", o.get("ev_under"))):
                    if ev is not None and ev >= V2.MIN_EDGE:
                        kk = (o["player"], o["stat"])
                        if kk not in best or ev > best[kk][1]:
                            best[kk] = (o, ev, side)
            for (pl, stat), (o, ev, side) in best.items():
                price = round(o["k"]["ask"] if side == "OVER" else 1 - o["k"]["bid"], 4)
                c.execute("INSERT OR IGNORE INTO picks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                          (key, pl, o["pid"], stat, o["line"], side, price, round(V2.fee(price), 4), o["model_p"], ev,
                           o["k"].get("oi"), o["injury"] or "", o["k"].get("t"), V2.iso(t0), prereg_sha))
            c.execute("INSERT INTO locked_games VALUES (?,?,?,?,?)", (key, V2.iso(kt), V2.iso(t0), n_rows, len(best)))
            summary["locked_now"].append(key); summary["picks_now"] += len(best)
        c.commit()
        picks = [dict(zip(["player", "stat", "line", "side", "price", "fee", "model_p", "ev", "lock_utc"], r)) for r in
                 c.execute("SELECT player,stat,line,side,price,fee,model_p,ev,lock_utc FROM picks WHERE game_key=?", (key,))]
        g = gm["doc"]
        data = {k2: g.get(k2) for k2 in ("game_key", "game_date", "away_team", "home_team", "kickoff_time")}
        data.update(sport="NBA", model=DOC, prereg_sha256=prereg_sha, scored_utc=V2.iso(t0),
                    locked=key in locked or key in summary["locked_now"], paper_picks=picks,
                    rows=[{kk: vv for kk, vv in o.items() if kk not in ("pid",)} for o in rows_out],
                    note="Model chance vs exchange price (NBA props model v3, the app's model since 2026-11-07 by the "
                         "owner's decision). Paper test only; nothing is bet. On past games Kalshi's price was more "
                         "right than DeVig's props models; not proven to beat the market.")
        data["export_hash"] = hashlib.sha256(json.dumps({kk: vv for kk, vv in data.items() if kk != "scored_utc"},
                                                        sort_keys=True, default=str).encode()).hexdigest()
        docs.append({"collection": "props_model", "doc_id": key, "data": data})
    # ---- grade: Kalshi's own settlement of every locked market of finished games (as v2) ----
    graded = {r[0] for r in c.execute("SELECT ticker FROM grades")}
    ng = 0
    for key, kick in c.execute("SELECT game_key, kickoff_utc FROM locked_games").fetchall():
        from datetime import datetime
        kt = datetime.fromisoformat(kick.replace("Z", "+00:00")) if kick else None
        if not kt or t0 < kt + timedelta(hours=V2.GRADE_WAIT_H):
            continue
        need = [r for r in c.execute("SELECT ticker, event_ticker FROM locked_rows WHERE game_key=?", (key,)).fetchall()
                if r[0] and r[0] not in graded]
        for et in sorted({r[1] for r in need if r[1]}):
            ev = V2.get_json(f"{V2.KALSHI}/events/{et}", {"with_nested_markets": "true"}) or {}
            ms = (ev.get("event") or {}).get("markets") or ev.get("markets") or []
            need_t = {r[0] for r in need}
            for m in ms:
                res = str(m.get("result") or "").lower()
                done = res or str(m.get("status") or "").lower() in ("settled", "finalized")
                if m.get("ticker") in need_t and done and m["ticker"] not in graded:
                    c.execute("INSERT OR IGNORE INTO grades VALUES (?,?,?,?)",
                              (m["ticker"], key, res or str(m.get("status")).lower(), V2.iso(t0)))
                    graded.add(m["ticker"]); ng += 1
    c.commit()
    summary["graded_now"] = ng
    tally = c.execute("""SELECT COUNT(*), SUM(CASE WHEN (p.side='OVER' AND g.result='yes') OR (p.side='UNDER' AND g.result='no') THEN 1 ELSE 0 END),
                         SUM(CASE WHEN (p.side='OVER' AND g.result='yes') OR (p.side='UNDER' AND g.result='no') THEN 1-p.price-p.fee ELSE -p.price-p.fee END),
                         SUM(p.price+p.fee) FROM picks p JOIN grades g ON g.ticker=p.ticker
                         WHERE g.result IN ('yes', 'no')""").fetchone()
    report = {"doc": DOC, "sport": "NBA", "updated_utc": V2.iso(t0), "prereg_sha256": prereg_sha,
              "model_sha256": V2.sha(MODEL), "paper_picks_graded": tally[0] or 0, "wins": tally[1] or 0,
              "profit_per_1_contract_sum": round(tally[2] or 0, 3), "cost_sum": round(tally[3] or 0, 3),
              "roi": round((tally[2] or 0) / tally[3], 4) if tally[3] else None,
              "backtest": "On reused 2025-26 Kalshi prices v3 was a little more right than v2 (log loss -0.0033); "
                          "Kalshi's price was more right than both.",
              "note": "Paper test since 2026-11-07 (owner's decision; v2 keeps its own paper test). Profit counts the "
                      "ask price paid plus an estimated Kalshi fee. Graded by Kalshi's own settlement. Not proven."}
    report["export_hash"] = hashlib.sha256(json.dumps({k2: v for k2, v in report.items() if k2 != "updated_utc"},
                                                      sort_keys=True).encode()).hexdigest()
    docs.append({"collection": "props_model_report", "doc_id": DOC, "data": report})
    json.dump({"sport": "NBA_PROPS_MODEL", "generated_at": V2.iso(t0), "n_docs": len(docs), "summary": summary,
               "docs": docs}, open(OUT, "w"), separators=(",", ":"), default=str)
    print(json.dumps(summary, indent=1), json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
