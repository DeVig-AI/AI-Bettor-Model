#!/usr/bin/env python3
"""
nba_props_model_v1_live.py -- runs the frozen NBA prop model (NBA_PROPS_MODEL_V1) against Kalshi prices in
nba/props_exchanges_export.json, writes an app export, and keeps an append-only paper log for the pre-registered live
test NBA_PROPS_MODEL_V1_LIVE (nba/NBA_PROPS_MODEL_V1_LIVE_PREREG.md). Nothing is bet.

Grading uses Kalshi's own settlement of each locked market (yes / no), read back from the public API after the game.
Run from the repo root (GitHub Actions):  python3 nba/nba_props_model_v1_live.py
"""
import hashlib, json, os, re, sqlite3, sys, time, unicodedata, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nba_props_model_lib_v1 as L  # noqa: E402

TABLES = os.path.join(HERE, "nba_props_model_v1_tables.json")
PREREG = os.path.join(HERE, "NBA_PROPS_MODEL_V1_LIVE_PREREG.md")
PRICES = os.path.join(HERE, "props_exchanges_export.json")
DB = os.path.join(HERE, "NBA_PROPS_MODEL_V1_LOG.sqlite3")
OUT = os.path.join(HERE, "props_model_export.json")
CACHE = os.path.join(HERE, ".box_cache")
BOX_URL = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_player_boxscores/player_box_{y}.csv"
INJ_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries"
KALSHI = "https://api.elections.kalshi.com/trade-api/v2"
UA = "nba-props-model/1.0 (personal research; read-only)"

# ---- pre-registered constants (must match the prereg text) ----
LOCK_WINDOW_START_H = 6.0
LOCK_WINDOW_END_MIN = 30
MIN_PREV_GAMES = 5              # fewest prior played games for a model chance to be SHOWN
MIN_PREV_GAMES_PICK = 40        # fewest prior played games for a paper PICK (history: < 40 ran 3-5 pts too high)
PICK_STATS = {"points", "rebounds", "assists", "threes", "pts_reb_ast", "pts_reb", "pts_ast", "reb_ast"}
                                # steals, blocks, stl+blk, turnovers shown but never picked (no better than a hit rate)
MIN_OPEN_INTEREST = 100.0
MAX_GAP = 0.20
MIN_EDGE = 0.05
FEE_RATE = 0.07
STALE_DAYS = 30                 # skip a pick if the player's last played game is > 30 days old (long absence)
INJ_EXCLUDE = re.compile(r"^(out|doubtful|suspension|suspended|injured reserve)", re.I)
GRADE_WAIT_H = 4.0


def now_utc():
    return datetime.now(timezone.utc)


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def get_json(url, params=None, tries=3):
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    for i in range(tries):
        time.sleep(0.2)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429 and i < tries - 1:
                time.sleep(2 ** (i + 1)); continue
            print("HTTP", e.code, url[:150]); return None
        except Exception as e:
            if i < tries - 1:
                time.sleep(2 ** i); continue
            print("ERR", type(e).__name__, url[:150]); return None


def fetch_box(y):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, f"player_box_{y}.csv")
    req = urllib.request.Request(BOX_URL.format(y=y), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as r, open(p, "wb") as f:
        f.write(r.read())
    return p


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z ]", "", s.replace("-", " ").replace(".", ""))
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def fee(p):
    return FEE_RATE * p * (1 - p)


def season_now(t):
    return t.year + 1 if t.month >= 9 else t.year      # ESPN season label = year the season ends


def load_history(t0):
    S = season_now(t0)
    frames = []
    for y in (S - 2, S - 1, S):
        try:
            frames.append(L.load_box(fetch_box(y)))
        except Exception as e:  # current season's file may not exist yet in October
            print("box score download failed", y, e)
    return L.player_games(pd.concat(frames, ignore_index=True))


def injuries():
    d = get_json(INJ_URL) or {}
    out = {}
    for team in d.get("injuries") or []:
        for it in team.get("injuries") or []:
            nm = (it.get("athlete") or {}).get("displayName")
            if nm:
                out[norm(nm)] = it.get("status") or (it.get("type") or {}).get("description") or ""
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
    t0 = now_utc()
    tables = json.load(open(TABLES))["tables"]
    prereg_sha = sha(PREREG) if os.path.exists(PREREG) else None
    prices = json.load(open(PRICES))
    pg = load_history(t0)
    exp = L.next_game_expectations(pg, pd.Timestamp(t0.replace(tzinfo=None)))
    by_name = {}
    last_name = pg.groupby("player_id")["name"].last()
    for pid in exp:
        if pid in last_name.index:
            by_name.setdefault(norm(last_name[pid]), []).append(pid)
    inj = injuries()
    c = db()
    c.execute("INSERT OR IGNORE INTO runs VALUES (?,?,?,?,?)", (iso(t0), prereg_sha, sha(TABLES), prices.get("generated_at"),
                                                                 "" if prereg_sha else "NO PREREG FILE -- nothing locked"))
    locked = {r[0] for r in c.execute("SELECT game_key FROM locked_games")}
    docs, summary = [], {"games": 0, "rows_scored": 0, "unmatched_rows": 0, "locked_now": [], "picks_now": 0}
    for d in prices.get("docs", []):
        g = d["data"]
        key, away, home, kick = g["game_key"], g["away_team"], g["home_team"], g.get("kickoff_time")
        kt = datetime.fromisoformat(kick.replace("Z", "+00:00")) if kick else None
        rows_out = []
        for r in g.get("rows", []):
            cands = by_name.get(norm(r["player"]), [])
            if len(cands) > 1:
                cands = [p for p in cands if exp[p]["team"] in (away, home)]
            pid = cands[0] if len(cands) == 1 else None
            e = exp.get(pid, {}) if pid else {}
            ev_, n_ = e.get("exp_" + r["stat"]), e.get("n", 0)
            p = L.p_over(tables, r["stat"], ev_, r["line"]) if (pid and n_ >= MIN_PREV_GAMES) else None
            summary["unmatched_rows"] += int(pid is None)
            k = r.get("k") or {}
            mid = (k["bid"] + k["ask"]) / 2 if k.get("bid") is not None and k.get("ask") is not None else None
            stale = bool(pid and e.get("last_game") is not None and (pd.Timestamp(t0.replace(tzinfo=None)) - e["last_game"]).days > STALE_DAYS)
            o = {"player": r["player"], "stat": r["stat"], "line": r["line"], "model_p": None if p is None else round(p, 4),
                 "expected": None if ev_ is None else round(float(ev_), 2), "n_games": int(n_ or 0), "k": k, "p": r.get("p"),
                 "k_mid": mid, "pid": pid, "stale": stale, "injury": inj.get(norm(r["player"]))}
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
                           k.get("ask"), k.get("oi"), k.get("t"), k.get("e"), iso(t0)))
                n_rows += 1
                if o["injury"] and INJ_EXCLUDE.search(o["injury"]):
                    continue
                if (k.get("oi") or 0) < MIN_OPEN_INTEREST or o["stat"] not in PICK_STATS or o["n_games"] < MIN_PREV_GAMES_PICK:
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
                           o["k"].get("oi"), o["injury"] or "", o["k"].get("t"), iso(t0), prereg_sha))
            c.execute("INSERT INTO locked_games VALUES (?,?,?,?,?)", (key, kick, iso(t0), n_rows, len(best)))
            summary["locked_now"].append(key); summary["picks_now"] += len(best)
        c.commit()
        picks = [dict(zip(["player", "stat", "line", "side", "price", "fee", "model_p", "ev", "lock_utc"], r)) for r in
                 c.execute("SELECT player,stat,line,side,price,fee,model_p,ev,lock_utc FROM picks WHERE game_key=?", (key,))]
        data = {k2: g.get(k2) for k2 in ("game_key", "game_date", "away_team", "home_team", "kickoff_time")}
        data.update(sport="NBA", model="NBA_PROPS_MODEL_V1", prereg_sha256=prereg_sha, scored_utc=iso(t0),
                    locked=key in locked or key in summary["locked_now"], paper_picks=picks,
                    rows=[{kk: v for kk, v in o.items() if kk not in ("pid",)} for o in rows_out],
                    note="Model chance vs exchange price. Paper test only; nothing is bet. Not proven to beat the market.")
        data["export_hash"] = hashlib.sha256(json.dumps({kk: v for kk, v in data.items() if kk != "scored_utc"},
                                                        sort_keys=True, default=str).encode()).hexdigest()
        docs.append({"collection": "props_model", "doc_id": key, "data": data})
        summary["games"] += 1
    # ---- grade: read Kalshi's own settlement for every locked market of finished games ----
    graded = {r[0] for r in c.execute("SELECT ticker FROM grades")}
    ng = 0
    for key, kick in c.execute("SELECT game_key, kickoff_utc FROM locked_games").fetchall():
        kt = datetime.fromisoformat(kick.replace("Z", "+00:00")) if kick else None
        if not kt or t0 < kt + timedelta(hours=GRADE_WAIT_H):
            continue
        need = [r for r in c.execute("SELECT ticker, event_ticker FROM locked_rows WHERE game_key=?", (key,)).fetchall()
                if r[0] and r[0] not in graded]
        for et in sorted({r[1] for r in need if r[1]}):
            ev = get_json(f"{KALSHI}/events/{et}", {"with_nested_markets": "true"}) or {}
            ms = (ev.get("event") or {}).get("markets") or ev.get("markets") or []
            need_t = {r[0] for r in need}
            for m in ms:
                res = str(m.get("result") or "").lower()
                # record every market once it has settled, however it settled, so it is never fetched again;
                # only "yes" / "no" count in the tally (void / fair-value settlements are excluded, as pre-registered)
                done = res or str(m.get("status") or "").lower() in ("settled", "finalized")
                if m.get("ticker") in need_t and done and m["ticker"] not in graded:
                    c.execute("INSERT OR IGNORE INTO grades VALUES (?,?,?,?)",
                              (m["ticker"], key, res or str(m.get("status")).lower(), iso(t0)))
                    graded.add(m["ticker"]); ng += 1
    c.commit()
    summary["graded_now"] = ng
    tally = c.execute("""SELECT COUNT(*), SUM(CASE WHEN (p.side='OVER' AND g.result='yes') OR (p.side='UNDER' AND g.result='no') THEN 1 ELSE 0 END),
                         SUM(CASE WHEN (p.side='OVER' AND g.result='yes') OR (p.side='UNDER' AND g.result='no') THEN 1-p.price-p.fee ELSE -p.price-p.fee END),
                         SUM(p.price+p.fee) FROM picks p JOIN grades g ON g.ticker=p.ticker
                         WHERE g.result IN ('yes', 'no')""").fetchone()
    report = {"doc": "NBA_PROPS_MODEL_V1", "sport": "NBA", "updated_utc": iso(t0), "prereg_sha256": prereg_sha,
              "tables_sha256": sha(TABLES), "paper_picks_graded": tally[0] or 0, "wins": tally[1] or 0,
              "profit_per_1_contract_sum": round(tally[2] or 0, 3), "cost_sum": round(tally[3] or 0, 3),
              "roi": round((tally[2] or 0) / tally[3], 4) if tally[3] else None,
              "note": "Paper test. Profit counts the ask price paid plus an estimated Kalshi fee. Graded by Kalshi's own settlement."}
    report["export_hash"] = hashlib.sha256(json.dumps({k2: v for k2, v in report.items() if k2 != "updated_utc"}, sort_keys=True).encode()).hexdigest()
    docs.append({"collection": "props_model_report", "doc_id": "NBA_PROPS_MODEL_V1", "data": report})
    json.dump({"sport": "NBA_PROPS_MODEL", "generated_at": iso(t0), "n_docs": len(docs), "summary": summary, "docs": docs},
              open(OUT, "w"), separators=(",", ":"), default=str)
    print(json.dumps(summary, indent=1), json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
