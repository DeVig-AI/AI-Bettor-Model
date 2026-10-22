#!/usr/bin/env python3
"""
nba_props_model_v3_shadow.py -- NBA_PROPS_MODEL_V3_SHADOW (nba/NBA_PROPS_MODEL_V3_SHADOW_PREREG.md): v3's chance for
every Kalshi prop row of a game, locked at the same moment rule as the v2 live test. No picks. Graded later by
joining tickers to Kalshi's settlements in the v2 live log. Nothing is bet.

Run from the repo root (GitHub Actions, right after nba_props_model_v2_live.py):  python3 nba/nba_props_model_v3_shadow.py
"""
import hashlib, json, os, sqlite3, sys
from datetime import datetime, timedelta, timezone
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nba_props_model_v2_live as V2  # noqa: E402  (prices, box scores, rosters, injury report, name matching)
import nba_props_fit_v3 as F3  # noqa: E402
import nba_props_live_features_v3 as LF3  # noqa: E402

TARGET = 2027
MODEL = F3.out_path(TARGET)
PREREG = os.path.join(HERE, "NBA_PROPS_MODEL_V3_SHADOW_PREREG.md")
DB = os.path.join(HERE, "NBA_PROPS_MODEL_V3_SHADOW_LOG.sqlite3")


def db():
    c = sqlite3.connect(DB)
    c.executescript("""
    CREATE TABLE IF NOT EXISTS runs(run_utc TEXT PRIMARY KEY, prereg_sha256 TEXT, model_sha256 TEXT, prices_generated TEXT);
    CREATE TABLE IF NOT EXISTS locked_games(game_key TEXT PRIMARY KEY, kickoff_utc TEXT, lock_utc TEXT, n_rows INTEGER);
    CREATE TABLE IF NOT EXISTS locked_rows(game_key TEXT, player TEXT, player_id TEXT, stat TEXT, line REAL, v3_p REAL,
        v3_mean REAL, n_games INTEGER, k_bid REAL, k_ask REAL, k_oi REAL, ticker TEXT, lock_utc TEXT,
        PRIMARY KEY(game_key, player, stat, line));
    """)
    for t in ("locked_games", "locked_rows"):
        c.execute(f"CREATE TRIGGER IF NOT EXISTS {t}_nu BEFORE UPDATE ON {t} BEGIN SELECT RAISE(ABORT,'append only'); END")
        c.execute(f"CREATE TRIGGER IF NOT EXISTS {t}_nd BEFORE DELETE ON {t} BEGIN SELECT RAISE(ABORT,'append only'); END")
    return c


def main():
    t0 = V2.now_utc()
    prereg_sha = V2.sha(PREREG) if os.path.exists(PREREG) else None
    prices = json.load(open(V2.PRICES))
    c = db()
    c.execute("INSERT OR IGNORE INTO runs VALUES (?,?,?,?)", (V2.iso(t0), prereg_sha, V2.sha(MODEL), prices.get("generated_at")))
    locked = {r[0] for r in c.execute("SELECT game_key FROM locked_games")}
    games = []
    for d in prices.get("docs", []):
        g = d["data"]
        if not g.get("kickoff_time"):
            continue
        kt = datetime.fromisoformat(g["kickoff_time"].replace("Z", "+00:00"))
        if not (kt - timedelta(hours=V2.LOCK_WINDOW_START_H) <= t0 <= kt - timedelta(minutes=V2.LOCK_WINDOW_END_MIN)):
            continue
        if g["game_key"] in locked or not prereg_sha:
            continue
        games.append({"game_key": g["game_key"], "away": g["away_team"], "home": g["home_team"], "kick": kt,
                      "date": pd.Timestamp(kt.astimezone(V2.ET).date()), "doc": g})
    summary = {"games_to_lock": len(games), "locked_now": [], "rows_now": 0}
    if games:
        box = V2.load_box(t0)
        rosters, inj = V2.rosters_and_injuries(sorted({t for gm in games for t in (gm["away"], gm["home"])}))
        model = F3.load(TARGET)
        season = V2.season_now(t0)
        for date in sorted({gm["date"] for gm in games}):
            gms = [gm for gm in games if gm["date"] == date]
            hist = box[box["game_date"] < date]
            names = hist.drop_duplicates("player_id", keep="last").set_index("player_id")["name"]
            out_ids = {pid for t in {x for gm in gms for x in (gm["away"], gm["home"])}
                       for pid, nm in (rosters.get(t) or {}).items() if V2.INJ_EXCLUDE.search(inj.get(V2.norm(nm), "") or "")}
            out_ids |= {pid for pid, nm in names.items() if V2.INJ_EXCLUDE.search(inj.get(V2.norm(nm), "") or "")}
            ros = {t: set(v) for t, v in rosters.items()} if rosters else None
            feats = LF3.live_features(hist, [{k: gm[k] for k in ("game_key", "date", "away", "home")} for gm in gms],
                                      out_ids, ros, season)
            for gm in gms:
                f = feats[feats["game_key"] == gm["game_key"]] if len(feats) else feats
                by_name = {}
                for i, r in f.iterrows():
                    by_name.setdefault(V2.norm(r["name"]), set()).add(i)
                for team in (gm["away"], gm["home"]):
                    for pid, nm in (rosters.get(team) or {}).items():
                        hit = f.index[f["player_id"] == pid]
                        if len(hit):
                            by_name.setdefault(V2.norm(nm), set()).add(hit[0])
                n = 0
                for r in gm["doc"].get("rows", []):
                    k = r.get("k") or {}
                    cand = sorted(by_name.get(V2.norm(r["player"]), []))
                    if len(cand) != 1 or r["stat"] not in V2.PICK_STATS or k.get("bid") is None or k.get("ask") is None:
                        continue
                    fr = f.loc[[cand[0]]]
                    mu, p = F3.p_over(model, r["stat"], fr, [r["line"]])
                    if not np.isfinite(p[0]):
                        continue
                    c.execute("INSERT OR IGNORE INTO locked_rows VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                              (gm["game_key"], r["player"], str(fr["player_id"].iloc[0]), r["stat"], r["line"],
                               round(float(p[0]), 4), round(float(mu[0]), 3), int(fr["n_prev"].iloc[0]), k.get("bid"),
                               k.get("ask"), k.get("oi"), k.get("t"), V2.iso(t0)))
                    n += 1
                c.execute("INSERT INTO locked_games VALUES (?,?,?,?)", (gm["game_key"], V2.iso(gm["kick"]), V2.iso(t0), n))
                summary["locked_now"].append(gm["game_key"]); summary["rows_now"] += n
    c.commit()
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
