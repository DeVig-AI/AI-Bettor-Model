#!/usr/bin/env python3
"""
nhl_props_model_v1_live.py -- runs the frozen NHL prop model (NHL_PROPS_MODEL_V1) against Kalshi prices in
nhl/props_exchanges_export.json, writes an app export, and keeps an append-only paper log for the pre-registered live
test NHL_PROPS_MODEL_V1_LIVE (nhl/NHL_PROPS_MODEL_V1_LIVE_PREREG.md). Nothing is bet. Same design as
nba/nba_props_model_v1_live.py. Graded by Kalshi's own settlement of each locked market.
Run from the repo root (GitHub Actions, after nhl/nhl_boxscores_v1.py refreshed this season's box scores):
  python3 nhl/nhl_props_model_v1_live.py
"""
import hashlib, json, os, re, sqlite3, sys
from datetime import datetime, timedelta
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nhl_props_model_lib_v1 as L  # noqa: E402
import nhl_kalshi_common_v1 as K  # noqa: E402

TABLES = os.path.join(HERE, "nhl_props_model_v1_tables.json")
PREREG = os.path.join(HERE, "NHL_PROPS_MODEL_V1_LIVE_PREREG.md")
PRICES = os.path.join(HERE, "props_exchanges_export.json")
DB = os.path.join(HERE, "NHL_PROPS_MODEL_V1_LOG.sqlite3")
OUT = os.path.join(HERE, "props_model_export.json")
INJ_URL = "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries"

# ---- pre-registered constants (must match the prereg text) ----
LOCK_WINDOW_START_H = 6.0
LOCK_WINDOW_END_MIN = 30
MIN_PREV_GAMES = 5
MIN_PREV_GAMES_PICK = 40
PICK_STATS = {"goals", "assists", "points"}
MIN_OPEN_INTEREST = 100.0
MAX_SPREAD = 0.10
MAX_GAP = 0.20
MIN_EDGE = 0.05
FEE_RATE = 0.07
STALE_DAYS = 30
INJ_EXCLUDE = re.compile(r"^(out|injured reserve|ir|ltir|long[- ]term|day[- ]to[- ]day|suspen)", re.I)
GRADE_WAIT_H = 4.0


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def fee(p):
    return FEE_RATE * p * (1 - p)


def injuries():
    d = K.get(INJ_URL) or {}
    out = {}
    for team in d.get("injuries") or []:
        for it in team.get("injuries") or []:
            nm = (it.get("athlete") or {}).get("displayName")
            if nm:
                out[K.norm(nm)] = it.get("status") or (it.get("type") or {}).get("description") or ""
    return out


def db():
    c = sqlite3.connect(DB)
    c.executescript("""
    CREATE TABLE IF NOT EXISTS runs(run_utc TEXT PRIMARY KEY, prereg_sha256 TEXT, tables_sha256 TEXT, prices_generated TEXT, note TEXT);
    CREATE TABLE IF NOT EXISTS locked_games(game_key TEXT PRIMARY KEY, kickoff_utc TEXT, lock_utc TEXT, n_rows INTEGER, n_picks INTEGER);
    CREATE TABLE IF NOT EXISTS locked_rows(game_key TEXT, player TEXT, player_id TEXT, stat TEXT, line REAL, model_p REAL,
        n_games INTEGER, k_bid REAL, k_ask REAL, k_oi REAL, ticker TEXT, event_ticker TEXT, lock_utc TEXT,
        PRIMARY KEY(game_key, player, stat, line));
    CREATE TABLE IF NOT EXISTS picks(game_key TEXT, player TEXT, player_id TEXT, stat TEXT, line REAL, side TEXT,
        price REAL, fee REAL, model_p REAL, ev REAL, k_oi REAL, injury_note TEXT, ticker TEXT, lock_utc TEXT, prereg_sha256 TEXT,
        PRIMARY KEY(game_key, player, stat));
    CREATE TABLE IF NOT EXISTS grades(ticker TEXT PRIMARY KEY, game_key TEXT, result TEXT, graded_utc TEXT);
    """)
    for t in ("locked_games", "locked_rows", "picks", "grades"):
        c.execute(f"CREATE TRIGGER IF NOT EXISTS {t}_nu BEFORE UPDATE ON {t} BEGIN SELECT RAISE(ABORT,'append only'); END")
        c.execute(f"CREATE TRIGGER IF NOT EXISTS {t}_nd BEFORE DELETE ON {t} BEGIN SELECT RAISE(ABORT,'append only'); END")
    return c


def main():
    t0 = K.now_utc()
    frozen = json.load(open(TABLES))
    P, tables = frozen["params"], frozen["tables"]
    prereg_sha = sha(PREREG) if os.path.exists(PREREG) else None
    prices = json.load(open(PRICES))
    pg = L.player_games(L.load_games())
    pg["full"] = (pg["first_name"].fillna("") + " " + pg["last_name"].fillna("")).map(K.norm)
    as_of = pd.Timestamp(t0.replace(tzinfo=None))
    exp = L.next_game_expectations(pg, as_of, P["span_short"], P["span_long"], P["shrink_k"])
    last = pg.sort_values(["game_date", "game_id"]).groupby("player_id").tail(1)
    by_name = {}
    for pid, nm in zip(last["player_id"], last["full"]):
        if pid in exp:
            by_name.setdefault(nm, []).append(pid)
    inj = injuries()
    c = db()
    c.execute("INSERT OR IGNORE INTO runs VALUES (?,?,?,?,?)", (K.iso(t0), prereg_sha, sha(TABLES), prices.get("generated_at"),
                                                                 "" if prereg_sha else "NO PREREG FILE -- nothing locked"))
    locked = {r[0] for r in c.execute("SELECT game_key FROM locked_games")}
    docs, summary = [], {"games": 0, "rows_scored": 0, "unmatched_rows": 0, "locked_now": [], "picks_now": 0}
    for d in prices.get("docs", []):
        g = d["data"]
        key, away, home, kick = g["game_key"], g["away_team"], g["home_team"], g.get("kickoff_time")
        kt = datetime.fromisoformat(kick.replace("Z", "+00:00")) if kick else None
        rows_out = []
        for r in g.get("rows", []):
            cands = by_name.get(K.norm(r["player"]), [])
            if len(cands) > 1:
                cands = [p for p in cands if exp[p]["team"] in (away, home)]
            pid = cands[0] if len(cands) == 1 else None
            e = exp.get(pid, {}) if pid else {}
            ev_, n_ = e.get("exp_" + r["stat"]), e.get("n", 0)
            p = L.p_over(P["method"], tables, r["stat"], ev_, r["line"]) if (pid and n_ >= MIN_PREV_GAMES) else None
            summary["unmatched_rows"] += int(pid is None)
            k = r.get("k") or {}
            mid = (k["bid"] + k["ask"]) / 2 if k.get("bid") is not None and k.get("ask") is not None else None
            stale = bool(pid and e.get("last_game") is not None and (as_of - e["last_game"]).days > STALE_DAYS)
            o = {"player": r["player"], "stat": r["stat"], "line": r["line"], "model_p": None if p is None else round(p, 4),
                 "expected": None if ev_ is None else round(float(ev_), 3), "n_games": int(n_ or 0), "k": k,
                 "k_mid": mid, "pid": pid, "stale": stale, "injury": inj.get(K.norm(r["player"]))}
            if p is not None and k.get("ask") is not None and k.get("bid") is not None:
                no_ask = round(1 - k["bid"], 4)
                o["ev_over"] = round(p - k["ask"] - fee(k["ask"]), 4)
                o["ev_under"] = round((1 - p) - no_ask - fee(no_ask), 4)
            rows_out.append(o)
            summary["rows_scored"] += int(p is not None)
        in_window = kt and (kt - timedelta(hours=LOCK_WINDOW_START_H) <= t0 <= kt - timedelta(minutes=LOCK_WINDOW_END_MIN))
        if prereg_sha and in_window and key not in locked:
            n_rows, best = 0, {}
            for o in rows_out:
                k = o["k"]
                if o["model_p"] is None or not k or k.get("ask") is None or k.get("bid") is None:
                    continue
                c.execute("INSERT OR IGNORE INTO locked_rows VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                          (key, o["player"], o["pid"], o["stat"], o["line"], o["model_p"], o["n_games"], k.get("bid"),
                           k.get("ask"), k.get("oi"), k.get("t"), k.get("e"), K.iso(t0)))
                n_rows += 1
                if o["injury"] and INJ_EXCLUDE.search(o["injury"]):
                    continue
                if (k.get("oi") or 0) < MIN_OPEN_INTEREST or o["stat"] not in PICK_STATS or o["n_games"] < MIN_PREV_GAMES_PICK:
                    continue
                if not (0 < k["bid"] < k["ask"] < 1) or k["ask"] - k["bid"] > MAX_SPREAD:
                    continue
                if o["stale"] or o["k_mid"] is None or abs(o["model_p"] - o["k_mid"]) > MAX_GAP:
                    continue
                for side, ev in (("OVER", o.get("ev_over")), ("UNDER", o.get("ev_under"))):
                    if ev is not None and ev >= MIN_EDGE:
                        kk = (o["player"], o["stat"])
                        if kk not in best or ev > best[kk][1]:
                            best[kk] = (o, ev, side)
            for (pl, stat), (o, ev, side) in best.items():
                price = round(o["k"]["ask"] if side == "OVER" else 1 - o["k"]["bid"], 4)
                c.execute("INSERT OR IGNORE INTO picks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                          (key, pl, o["pid"], stat, o["line"], side, price, round(fee(price), 4), o["model_p"], ev,
                           o["k"].get("oi"), o["injury"] or "", o["k"].get("t"), K.iso(t0), prereg_sha))
            c.execute("INSERT INTO locked_games VALUES (?,?,?,?,?)", (key, kick, K.iso(t0), n_rows, len(best)))
            summary["locked_now"].append(key); summary["picks_now"] += len(best)
        c.commit()
        picks = [dict(zip(["player", "stat", "line", "side", "price", "fee", "model_p", "ev", "lock_utc"], r)) for r in
                 c.execute("SELECT player,stat,line,side,price,fee,model_p,ev,lock_utc FROM picks WHERE game_key=?", (key,))]
        data = {k2: g.get(k2) for k2 in ("game_key", "game_date", "away_team", "home_team", "kickoff_time")}
        data.update(sport="NHL", model="NHL_PROPS_MODEL_V1", prereg_sha256=prereg_sha, scored_utc=K.iso(t0),
                    locked=key in locked or key in summary["locked_now"], paper_picks=picks,
                    rows=[{kk: v for kk, v in o.items() if kk != "pid"} for o in rows_out],
                    note="Model chance vs exchange price. Paper test only; nothing is bet. Not proven to beat the market.")
        data["export_hash"] = hashlib.sha256(json.dumps({kk: v for kk, v in data.items() if kk != "scored_utc"},
                                                        sort_keys=True, default=str).encode()).hexdigest()
        docs.append({"collection": "props_model", "doc_id": key, "data": data})
        summary["games"] += 1
    # ---- grade: Kalshi's own settlement for every locked market of finished games ----
    graded = {r[0] for r in c.execute("SELECT ticker FROM grades")}
    ng = 0
    for key, kick in c.execute("SELECT game_key, kickoff_utc FROM locked_games").fetchall():
        kt = datetime.fromisoformat(kick.replace("Z", "+00:00")) if kick else None
        if not kt or t0 < kt + timedelta(hours=GRADE_WAIT_H):
            continue
        need = [r for r in c.execute("SELECT ticker, event_ticker FROM locked_rows WHERE game_key=?", (key,)).fetchall()
                if r[0] and r[0] not in graded]
        need_t = {r[0] for r in need}
        for et in sorted({r[1] for r in need if r[1]}):
            ev = K.get(K.KALSHI + f"/events/{et}", {"with_nested_markets": "true"}) or {}
            ms = (ev.get("event") or {}).get("markets") or ev.get("markets") or []
            if not ms:                                   # settled markets may already be on /historical
                ms = (K.get(K.KALSHI + "/historical/markets", {"event_ticker": et, "limit": 1000}) or {}).get("markets") or []
            for m in ms:
                res = str(m.get("result") or "").lower()
                done = res or str(m.get("status") or "").lower() in ("settled", "finalized")
                if m.get("ticker") in need_t and done and m["ticker"] not in graded:
                    c.execute("INSERT OR IGNORE INTO grades VALUES (?,?,?,?)",
                              (m["ticker"], key, res or str(m.get("status")).lower(), K.iso(t0)))
                    graded.add(m["ticker"]); ng += 1
    c.commit()
    summary["graded_now"] = ng
    tally = c.execute("""SELECT COUNT(*), SUM(CASE WHEN (p.side='OVER' AND g.result='yes') OR (p.side='UNDER' AND g.result='no') THEN 1 ELSE 0 END),
                         SUM(CASE WHEN (p.side='OVER' AND g.result='yes') OR (p.side='UNDER' AND g.result='no') THEN 1-p.price-p.fee ELSE -p.price-p.fee END),
                         SUM(p.price+p.fee) FROM picks p JOIN grades g ON g.ticker=p.ticker
                         WHERE g.result IN ('yes', 'no')""").fetchone()
    report = {"doc": "NHL_PROPS_MODEL_V1", "sport": "NHL", "updated_utc": K.iso(t0), "prereg_sha256": prereg_sha,
              "tables_sha256": sha(TABLES), "paper_picks_graded": tally[0] or 0, "wins": tally[1] or 0,
              "profit_per_1_contract_sum": round(tally[2] or 0, 3), "cost_sum": round(tally[3] or 0, 3),
              "roi": round((tally[2] or 0) / tally[3], 4) if tally[3] else None,
              "note": "Paper test. Profit counts the ask price paid plus an estimated Kalshi fee. Graded by Kalshi's own settlement."}
    report["export_hash"] = hashlib.sha256(json.dumps({k2: v for k2, v in report.items() if k2 != "updated_utc"},
                                                      sort_keys=True).encode()).hexdigest()
    docs.append({"collection": "props_model_report", "doc_id": "NHL_PROPS_MODEL_V1", "data": report})
    json.dump({"sport": "NHL_PROPS_MODEL", "generated_at": K.iso(t0), "n_docs": len(docs), "summary": summary, "docs": docs},
              open(OUT, "w"), separators=(",", ":"), default=str)
    print(json.dumps(summary, indent=1), json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
