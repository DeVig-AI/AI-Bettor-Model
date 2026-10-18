#!/usr/bin/env python3
"""
nfl_props_model_v1_live.py -- runs the frozen NFL prop model (NFL_PROPS_MODEL_V1) against the exchange
prices in nfl/props_exchanges_export.json, writes an app export, and keeps an append-only paper log for
the pre-registered live test NFL_PROPS_MODEL_V1_LIVE (see nfl/NFL_PROPS_MODEL_V1_LIVE_PREREG.md).

Nothing is bet. "Picks" are paper records graded from official play-by-play.

Run from the repo root (GitHub Actions):  python3 nfl/nfl_props_model_v1_live.py
Inputs  : nfl/props_exchanges_export.json, nfl/injury_report.json, nfl/nfl_props_model_v1_tables.json,
          nfl/NFL_PROPS_MODEL_V1_LIVE_PREREG.md, nflverse play-by-play 2023-2026 + roster 2026 (downloaded).
Outputs : nfl/props_model_export.json, nfl/PROPS_MODEL_V1_LOG.sqlite3 (append-only tables).
"""
import hashlib, json, os, re, sqlite3, sys, unicodedata, urllib.request
from datetime import datetime, timedelta, timezone
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nfl_props_model_lib_v1 as L  # noqa: E402

TABLES = os.path.join(HERE, "nfl_props_model_v1_tables.json")
PREREG = os.path.join(HERE, "NFL_PROPS_MODEL_V1_LIVE_PREREG.md")
PRICES = os.path.join(HERE, "props_exchanges_export.json")
INJ = os.path.join(HERE, "injury_report.json")
DB = os.path.join(HERE, "PROPS_MODEL_V1_LOG.sqlite3")
OUT = os.path.join(HERE, "props_model_export.json")
CACHE = os.path.join(HERE, ".nflverse_cache")
NFLVERSE = "https://github.com/nflverse/nflverse-data/releases/download/"
SEASONS = [2023, 2024, 2025, 2026]

# ---- pre-registered constants (must match the prereg text) ----
LOCK_WINDOW_START_H = 6.0       # earliest lock: 6 h before kickoff
LOCK_WINDOW_END_MIN = 40        # latest lock: 40 min before kickoff
MIN_PREV_GAMES = 3              # fewest prior games for a model chance to be SHOWN
MIN_PREV_GAMES_PICK = 21        # fewest prior games for a paper PICK (history: <=20 games ran 3-5 pts too high)
PICK_STATS = {"passing_yards", "passing_tds", "passing_attempts", "passing_completions", "interceptions",
              "rushing_yards", "rushing_attempts", "receiving_yards", "receptions", "rush_rec_yards"}
                                # touchdowns shown but never picked (history: no better than a simple hit rate)
MAX_GAP = 0.20                  # skip a pick if |model chance - Kalshi mid| > 0.20 (likely news the model can't see)
MIN_OPEN_INTEREST = 100.0       # Kalshi open interest (contracts) for a row to be pickable
MIN_EDGE = 0.05                 # expected value per $1 contract after the fee estimate
FEE_RATE = 0.07                 # Kalshi taker fee estimate: 0.07 * P * (1 - P) per contract
GRADE_WAIT_H = 12               # grade a game only 12 h after kickoff, once it is in nflverse play-by-play
INJ_EXCLUDE = re.compile(r"^(out|injured reserve|doubtful|physically unable|suspension|reserve|non-football)", re.I)


def now_utc():
    return datetime.now(timezone.utc)


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def fetch(rel, name):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, name)
    req = urllib.request.Request(NFLVERSE + rel, headers={"User-Agent": "nfl-props-model/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(p, "wb") as f:
        f.write(r.read())
    return p


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z ]", "", s.replace("-", " ").replace(".", ""))
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def fee(p):
    return FEE_RATE * p * (1 - p)


def db():
    c = sqlite3.connect(DB)
    c.executescript("""
    CREATE TABLE IF NOT EXISTS runs(run_utc TEXT PRIMARY KEY, prereg_sha256 TEXT, tables_sha256 TEXT, prices_generated TEXT, note TEXT);
    CREATE TABLE IF NOT EXISTS locked_games(game_key TEXT PRIMARY KEY, kickoff_utc TEXT, lock_utc TEXT, n_rows INTEGER, n_picks INTEGER);
    CREATE TABLE IF NOT EXISTS locked_rows(game_key TEXT, player TEXT, player_id TEXT, stat TEXT, line REAL, model_p REAL,
        k_bid REAL, k_ask REAL, k_oi REAL, lock_utc TEXT, PRIMARY KEY(game_key, player, stat, line));
    CREATE TABLE IF NOT EXISTS picks(game_key TEXT, player TEXT, player_id TEXT, stat TEXT, line REAL, side TEXT,
        price REAL, fee REAL, model_p REAL, ev REAL, k_oi REAL, injury_note TEXT, lock_utc TEXT, prereg_sha256 TEXT,
        PRIMARY KEY(game_key, player, stat));
    CREATE TABLE IF NOT EXISTS grades(game_key TEXT, player_id TEXT, stat TEXT, line REAL, actual REAL, played INTEGER,
        over_won INTEGER, graded_utc TEXT, PRIMARY KEY(game_key, player_id, stat, line));
    """)
    for t in ("locked_games", "locked_rows", "picks", "grades"):
        c.execute(f"CREATE TRIGGER IF NOT EXISTS {t}_nu BEFORE UPDATE ON {t} BEGIN SELECT RAISE(ABORT,'append only'); END")
        c.execute(f"CREATE TRIGGER IF NOT EXISTS {t}_nd BEFORE DELETE ON {t} BEGIN SELECT RAISE(ABORT,'append only'); END")
    return c


def load_history():
    frames = []
    for y in SEASONS:
        try:
            frames.append(L.load_pbp(fetch(f"pbp/play_by_play_{y}.csv.gz", f"pbp_{y}.csv.gz")))
        except Exception as e:  # a missing season file must not crash the job
            print("pbp download failed", y, e)
    pbp = pd.concat(frames, ignore_index=True)
    return pbp, L.player_games(pbp)


def roster_map():
    """(normalized name, team) -> gsis ids, plus (normalized name, None) -> ids on any team (fallback)."""
    r = pd.read_csv(fetch("rosters/roster_2026.csv", "roster_2026.csv"), low_memory=False)
    m = {}
    for row in r.itertuples(index=False):
        if not isinstance(row.gsis_id, str):
            continue
        for nm in {row.full_name, getattr(row, "football_name", None) and f"{row.football_name} {row.last_name}"}:
            if isinstance(nm, str):
                m.setdefault((norm(nm), row.team), set()).add(row.gsis_id)
                m.setdefault((norm(nm), None), set()).add(row.gsis_id)
    return m


def injury_status(name, teams):
    try:
        rep = json.load(open(INJ))
    except Exception:
        return None
    for t in teams:
        for p in (rep.get("teams") or {}).get(t, []) or []:
            if norm(p.get("name")) == norm(name):
                return p.get("status")
    return None


def main():
    t0 = now_utc()
    tables_art = json.load(open(TABLES))
    tables = tables_art["tables"]
    prereg_sha = sha(PREREG) if os.path.exists(PREREG) else None
    prices = json.load(open(PRICES))
    pbp, pg = load_history()
    rmap = roster_map()
    exp = L.next_game_expectations(pg, pd.Timestamp(t0.replace(tzinfo=None)))
    c = db()
    c.execute("INSERT OR IGNORE INTO runs VALUES (?,?,?,?,?)", (iso(t0), prereg_sha, sha(TABLES), prices.get("generated_at"),
                                                                 "" if prereg_sha else "NO PREREG FILE -- nothing locked"))
    locked = {r[0] for r in c.execute("SELECT game_key FROM locked_games")}
    docs, summary = [], {"games": 0, "rows_scored": 0, "unmatched_rows": 0, "locked_now": [], "picks_now": 0}
    for d in prices.get("docs", []):
        g = d["data"]
        key, away, home = g["game_key"], g["away_team"], g["home_team"]
        kick = g.get("kickoff_time")
        kt = datetime.fromisoformat(kick.replace("Z", "+00:00")) if kick else None
        rows_out = []
        for r in g.get("rows", []):
            ids = set()
            for t in (away, home):
                ids |= rmap.get((norm(r["player"]), t), set())
            if not ids:   # e.g. traded player not yet on the roster file's team: accept only a unique league-wide name
                ids = rmap.get((norm(r["player"]), None), set())
            pid = next(iter(ids)) if len(ids) == 1 else None
            e = exp.get(pid, {}) if pid else {}
            ev_, n_ = e.get("exp_" + r["stat"]), e.get("n_" + r["stat"], 0)
            p = L.p_over(tables, r["stat"], ev_, r["line"]) if (pid and n_ >= MIN_PREV_GAMES) else None
            if pid is None:
                summary["unmatched_rows"] += 1
            k = r.get("k") or {}
            mid = (k["bid"] + k["ask"]) / 2 if k.get("bid") is not None and k.get("ask") is not None else None
            o = {"player": r["player"], "stat": r["stat"], "line": r["line"], "model_p": None if p is None else round(p, 4),
                 "expected": None if ev_ is None else round(float(ev_), 2), "n_games": int(n_ or 0), "k": k, "p": r.get("p"),
                 "k_mid": mid, "pid": pid}
            if p is not None and k.get("ask") is not None and k.get("bid") is not None:
                yes_ask, no_ask = k["ask"], round(1 - k["bid"], 4)
                o["ev_over"] = round(p - yes_ask - fee(yes_ask), 4)
                o["ev_under"] = round((1 - p) - no_ask - fee(no_ask), 4)
            rows_out.append(o)
            summary["rows_scored"] += int(p is not None)
        # ---- lock (paper) ----
        in_window = kt and (kt - timedelta(hours=LOCK_WINDOW_START_H) <= t0 <= kt - timedelta(minutes=LOCK_WINDOW_END_MIN))
        if prereg_sha and in_window and key not in locked:
            n_rows, best = 0, {}
            for o in rows_out:
                if o["model_p"] is None or not o["k"] or o["k"].get("ask") is None:
                    continue
                c.execute("INSERT OR IGNORE INTO locked_rows VALUES (?,?,?,?,?,?,?,?,?,?)",
                          (key, o["player"], o["pid"], o["stat"], o["line"], o["model_p"], o["k"].get("bid"), o["k"].get("ask"),
                           o["k"].get("oi"), iso(t0)))
                n_rows += 1
                st = injury_status(o["player"], (away, home))
                if st and INJ_EXCLUDE.search(st):
                    continue
                if (o["k"].get("oi") or 0) < MIN_OPEN_INTEREST:
                    continue
                if o["stat"] not in PICK_STATS or o["n_games"] < MIN_PREV_GAMES_PICK:
                    continue
                if o["k_mid"] is None or abs(o["model_p"] - o["k_mid"]) > MAX_GAP:
                    continue
                for side, ev in (("OVER", o.get("ev_over")), ("UNDER", o.get("ev_under"))):
                    if ev is not None and ev >= MIN_EDGE:
                        kk = (o["player"], o["stat"])
                        if kk not in best or ev > best[kk][1]:
                            best[kk] = (o, ev, side, st)
            for (pl, stat), (o, ev, side, st) in best.items():
                price = round(o["k"]["ask"] if side == "OVER" else 1 - o["k"]["bid"], 4)
                c.execute("INSERT OR IGNORE INTO picks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                          (key, pl, o["pid"], stat, o["line"], side, price, round(fee(price), 4), o["model_p"], ev,
                           o["k"].get("oi"), st or "", iso(t0), prereg_sha))
            c.execute("INSERT INTO locked_games VALUES (?,?,?,?,?)", (key, kick, iso(t0), n_rows, len(best)))
            summary["locked_now"].append(key); summary["picks_now"] += len(best)
        c.commit()
        picks = [dict(zip(["player", "stat", "line", "side", "price", "fee", "model_p", "ev", "lock_utc"], r)) for r in
                 c.execute("SELECT player,stat,line,side,price,fee,model_p,ev,lock_utc FROM picks WHERE game_key=?", (key,))]
        data = {k2: g[k2] for k2 in ("game_key", "game_date", "away_team", "home_team", "kickoff_time")}
        data.update(sport="NFL", model="NFL_PROPS_MODEL_V1", prereg_sha256=prereg_sha, scored_utc=iso(t0),
                    locked=key in locked or key in summary["locked_now"], paper_picks=picks,
                    rows=[{kk: v for kk, v in o.items() if kk != "pid"} for o in rows_out],
                    note="Model chance vs exchange price. Paper test only; nothing is bet. Not proven to beat the market.")
        data["export_hash"] = hashlib.sha256(json.dumps({kk: v for kk, v in data.items() if kk != "scored_utc"},
                                                        sort_keys=True, default=str).encode()).hexdigest()
        docs.append({"collection": "props_model", "doc_id": key, "data": data})
        summary["games"] += 1
    # ---- grade finished locked games from play-by-play ----
    graded = {(r[0], r[1], r[2], r[3]) for r in c.execute("SELECT game_key, player_id, stat, line FROM grades")}
    ng = 0
    for key, kick in c.execute("SELECT game_key, kickoff_utc FROM locked_games").fetchall():
        kt = datetime.fromisoformat(kick.replace("Z", "+00:00")) if kick else None
        if not kt or t0 < kt + timedelta(hours=GRADE_WAIT_H):
            continue
        date, away, home = key.split("_")
        gd = pd.to_datetime(pbp["game_date"])
        d0 = pd.Timestamp(date)
        games = pbp[pbp["posteam"].isin([away, home]) & pbp["defteam"].isin([away, home]) &
                    (gd >= d0 - pd.Timedelta(days=1)) & (gd <= d0 + pd.Timedelta(days=1))]
        gids = games["game_id"].unique()
        if len(gids) != 1:          # not in play-by-play yet (or ambiguous): try again next run
            continue
        stats = pg[pg["game_id"] == gids[0]].groupby("player_id")[L.STATS].sum()
        for pl, pid, stat, line in c.execute("SELECT player, player_id, stat, line FROM locked_rows WHERE game_key=?", (key,)).fetchall():
            if (key, pid, stat, line) in graded or not pid:
                continue
            played = pid in stats.index
            actual = float(stats.at[pid, stat]) if played else 0.0   # no recorded involvement -> 0 (Kalshi "No")
            c.execute("INSERT OR IGNORE INTO grades VALUES (?,?,?,?,?,?,?,?)",
                      (key, pid, stat, line, actual, int(played), int(actual > line), iso(t0)))
            ng += 1
    c.commit()
    summary["graded_now"] = ng
    tally = c.execute("""SELECT COUNT(*), SUM(CASE WHEN (p.side='OVER' AND g.over_won=1) OR (p.side='UNDER' AND g.over_won=0) THEN 1 ELSE 0 END),
                         SUM(CASE WHEN (p.side='OVER' AND g.over_won=1) OR (p.side='UNDER' AND g.over_won=0) THEN 1-p.price-p.fee ELSE -p.price-p.fee END),
                         SUM(p.price+p.fee)
                         FROM picks p JOIN grades g ON g.game_key=p.game_key AND g.player_id=p.player_id AND g.stat=p.stat AND g.line=p.line""").fetchone()
    report = {"doc": "NFL_PROPS_MODEL_V1", "updated_utc": iso(t0), "prereg_sha256": prereg_sha,
              "tables_sha256": sha(TABLES), "paper_picks_graded": tally[0] or 0, "wins": tally[1] or 0,
              "profit_per_1_contract_sum": round(tally[2] or 0, 3), "cost_sum": round(tally[3] or 0, 3),
              "roi": round((tally[2] or 0) / tally[3], 4) if tally[3] else None,
              "note": "Paper test. Profit counts the ask price paid plus an estimated Kalshi fee. Not enough picks to mean anything until the season ends."}
    report["export_hash"] = hashlib.sha256(json.dumps({k2: v for k2, v in report.items() if k2 != "updated_utc"}, sort_keys=True).encode()).hexdigest()
    docs.append({"collection": "props_model_report", "doc_id": "NFL_PROPS_MODEL_V1", "data": report})
    json.dump({"sport": "NFL_PROPS_MODEL", "generated_at": iso(t0), "n_docs": len(docs), "summary": summary, "docs": docs},
              open(OUT, "w"), separators=(",", ":"), default=str)
    print(json.dumps(summary, indent=1), json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
