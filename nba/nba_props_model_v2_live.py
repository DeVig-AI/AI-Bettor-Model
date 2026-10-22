#!/usr/bin/env python3
"""
nba_props_model_v2_live.py -- runs the frozen NBA prop model v2 against Kalshi prices in nba/props_exchanges_export.json,
writes the app export, and keeps an append-only paper log for the pre-registered live test NBA_PROPS_MODEL_V2_LIVE
(nba/NBA_PROPS_MODEL_V2_LIVE_PREREG.md). Nothing is bet.

Grading uses Kalshi's own settlement of each locked market (yes / no), read back from the public API after the game.
Run from the repo root (GitHub Actions):  python3 nba/nba_props_model_v2_live.py [--dry-run]
--dry-run scores and prints but writes nothing (no lock, no log, no export).
"""
import argparse, hashlib, json, os, re, sqlite3, sys, time, unicodedata, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nba_props_model_lib_v1 as V1  # noqa: E402
_V1_STATS = list(V1.STATS)
import nba_props_fit_v2 as F  # noqa: E402
V1.STATS = _V1_STATS
import nba_props_model_lib_v2 as L  # noqa: E402
import nba_props_live_features_v2 as LF  # noqa: E402

TARGET = 2027
MODEL = F.out_path(TARGET)
PREREG = os.path.join(HERE, "NBA_PROPS_MODEL_V2_LIVE_PREREG.md")
PRICES = os.path.join(HERE, "props_exchanges_export.json")
DB = os.path.join(HERE, "NBA_PROPS_MODEL_V2_LOG.sqlite3")
OUT = os.path.join(HERE, "props_model_export.json")
CACHE = os.path.join(HERE, ".box_cache")
BOX_URL = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_player_boxscores/player_box_{y}.csv"
ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba"
KALSHI = "https://api.elections.kalshi.com/trade-api/v2"
UA = "nba-props-model/2.0 (personal research; read-only)"
ET = ZoneInfo("America/New_York")

# ---- pre-registered constants (must match the prereg text) ----
LOCK_WINDOW_START_H = 6.0
LOCK_WINDOW_END_MIN = 30
MIN_PREV_GAMES_PICK = 40
PICK_STATS = set(L.STATS)
MIN_OPEN_INTEREST = 100.0
MAX_SPREAD = 0.10
MAX_GAP = 0.20
MIN_EDGE = 0.05
FEE_RATE = 0.07
INJ_EXCLUDE = re.compile(r"^(out|doubtful|suspension|suspended|injured reserve)", re.I)
GRADE_WAIT_H = 4.0
BLEND = (-0.0382, 0.8473, 0.1391)       # information only (back-test learning games)
HISTORY_SEASONS = 7                     # box scores of seasons S-7..S, as the model was trained (n_prev counts them)


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


def fetch_box(y, refresh):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, f"player_box_{y}.csv")
    if refresh or not os.path.exists(p) or os.path.getsize(p) == 0:
        req = urllib.request.Request(BOX_URL.format(y=y), headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=300) as r, open(p, "wb") as f:
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


def load_box(t0):
    S = season_now(t0)
    paths = []
    for y in range(S - HISTORY_SEASONS, S + 1):
        try:
            paths.append(fetch_box(y, refresh=(y == S)))
        except Exception as e:  # current season's file may not exist yet in October
            print("box score download failed", y, e)
    return L.load_box(paths)


def rosters_and_injuries(teams):
    """ESPN rosters {team: {player_id: name}} for the given teams, and the injury report {norm name: status}."""
    idx = get_json(f"{ESPN}/teams") or {}
    ids = {}
    for sp in idx.get("sports") or []:
        for lg in sp.get("leagues") or []:
            for t in lg.get("teams") or []:
                t = t.get("team") or {}
                ab = L.ESPN_TO_STD.get(t.get("abbreviation"), t.get("abbreviation"))
                ids[ab] = t.get("id")
    rosters = {}
    for team in teams:
        if not ids.get(team):
            continue
        r = get_json(f"{ESPN}/teams/{ids[team]}/roster") or {}
        ath = r.get("athletes") or []
        if ath and isinstance(ath[0], dict) and "items" in ath[0]:       # grouped by position in some responses
            ath = [a for grp in ath for a in grp.get("items") or []]
        got = {str(a["id"]): a.get("displayName") or a.get("fullName") for a in ath if a.get("id")}
        if got:
            rosters[team] = got
    inj = {}
    d = get_json(f"{ESPN}/injuries") or {}
    for team in d.get("injuries") or []:
        for it in team.get("injuries") or []:
            nm = (it.get("athlete") or {}).get("displayName")
            if nm:
                inj[norm(nm)] = it.get("status") or (it.get("type") or {}).get("description") or ""
    return rosters, inj


def logit(p):
    p = min(max(p, 0.01), 0.99)
    return np.log(p / (1 - p))


def db():
    c = sqlite3.connect(DB)
    c.executescript("""
    CREATE TABLE IF NOT EXISTS runs(run_utc TEXT PRIMARY KEY, prereg_sha256 TEXT, model_sha256 TEXT, prices_generated TEXT, note TEXT);
    CREATE TABLE IF NOT EXISTS locked_games(game_key TEXT PRIMARY KEY, kickoff_utc TEXT, lock_utc TEXT, n_rows INTEGER, n_picks INTEGER);
    CREATE TABLE IF NOT EXISTS locked_rows(game_key TEXT, player TEXT, player_id TEXT, stat TEXT, line REAL, model_p REAL,
        v2_mean REAL, blend_p REAL, n_games INTEGER, days_since REAL, n_out REAL, injury TEXT, k_bid REAL, k_ask REAL,
        k_oi REAL, ticker TEXT, event_ticker TEXT, lock_utc TEXT, PRIMARY KEY(game_key, player, stat, line));
    CREATE TABLE IF NOT EXISTS picks(game_key TEXT, player TEXT, player_id TEXT, stat TEXT, line REAL, side TEXT,
        price REAL, fee REAL, model_p REAL, ev REAL, k_oi REAL, injury_note TEXT, ticker TEXT, lock_utc TEXT, prereg_sha256 TEXT,
        PRIMARY KEY(game_key, player, stat));
    CREATE TABLE IF NOT EXISTS grades(ticker TEXT PRIMARY KEY, game_key TEXT, result TEXT, graded_utc TEXT);
    """)
    for t in ("locked_games", "locked_rows", "picks", "grades"):
        c.execute(f"CREATE TRIGGER IF NOT EXISTS {t}_nu BEFORE UPDATE ON {t} BEGIN SELECT RAISE(ABORT,'append only'); END")
        c.execute(f"CREATE TRIGGER IF NOT EXISTS {t}_nd BEFORE DELETE ON {t} BEGIN SELECT RAISE(ABORT,'append only'); END")
    return c


def score_games(t0, prices):
    """v2 chance for every price row. Returns {game_key: [row dict]}."""
    games = []
    for d in prices.get("docs", []):
        g = d["data"]
        kick = g.get("kickoff_time")
        if not kick:
            continue
        kt = datetime.fromisoformat(kick.replace("Z", "+00:00"))
        games.append({"game_key": g["game_key"], "away": g["away_team"], "home": g["home_team"], "kick": kt,
                      "date": pd.Timestamp(kt.astimezone(ET).date()), "doc": g})
    box = load_box(t0)
    teams = sorted({t for gm in games for t in (gm["away"], gm["home"])})
    rosters, inj = rosters_and_injuries(teams)
    model = F.load(TARGET)
    out = {}
    for date in sorted({gm["date"] for gm in games}):
        gms = [gm for gm in games if gm["date"] == date]
        hist = box[box["game_date"] < date]
        ps_names = hist.drop_duplicates("player_id", keep="last").set_index("player_id")["name"]
        out_ids = set()
        for team in {t for gm in gms for t in (gm["away"], gm["home"])}:
            for pid, nm in (rosters.get(team) or {}).items():
                if INJ_EXCLUDE.search(inj.get(norm(nm), "") or ""):
                    out_ids.add(pid)
        for pid, nm in ps_names.items():               # players on the report but missing from a roster call
            if INJ_EXCLUDE.search(inj.get(norm(nm), "") or ""):
                out_ids.add(pid)
        ros = {t: set(v) for t, v in rosters.items()} if rosters else None
        feats = LF.live_features(hist, [{k: gm[k] for k in ("game_key", "date", "away", "home")} for gm in gms],
                                 out_ids, ros)
        for gm in gms:
            f = feats[feats["game_key"] == gm["game_key"]] if len(feats) else feats
            by_name = {}
            for i, r in f.iterrows():
                by_name.setdefault(norm(r["name"]), []).append(i)
            for team in (gm["away"], gm["home"]):     # roster display names can differ from box-score names
                for pid, nm in (rosters.get(team) or {}).items():
                    hit = f.index[(f["player_id"] == pid)]
                    if len(hit):
                        by_name.setdefault(norm(nm), []).append(hit[0])
            rows = []
            for r in gm["doc"].get("rows", []):
                cand = sorted(set(by_name.get(norm(r["player"]), [])))
                i = cand[0] if len(cand) == 1 else None
                k = r.get("k") or {}
                o = {"player": r["player"], "stat": r["stat"], "line": r["line"], "k": k, "p": r.get("p"),
                     "injury": inj.get(norm(r["player"])), "model_p": None, "expected": None, "n_games": 0,
                     "pid": None, "days_since": None, "n_out": None}
                if i is not None and r["stat"] in PICK_STATS:
                    fr = f.loc[[i]]
                    mu, p = F.p_over(model, r["stat"], fr, [r["line"]])
                    if np.isfinite(p[0]):
                        o.update(model_p=round(float(p[0]), 4), expected=round(float(mu[0]), 2),
                                 n_games=int(fr["n_prev"].iloc[0]), pid=str(fr["player_id"].iloc[0]),
                                 days_since=float(fr["days_since"].iloc[0]), n_out=float(fr["n_out"].iloc[0]))
                o["k_mid"] = (k["bid"] + k["ask"]) / 2 if k.get("bid") is not None and k.get("ask") is not None else None
                if o["model_p"] is not None and o["k_mid"] is not None:
                    z = BLEND[0] + BLEND[1] * logit(o["k_mid"]) + BLEND[2] * logit(o["model_p"])
                    o["blend_p"] = round(float(1 / (1 + np.exp(-z))), 4)
                    no_ask = round(1 - k["bid"], 4)
                    o["ev_over"] = round(o["model_p"] - k["ask"] - fee(k["ask"]), 4)
                    o["ev_under"] = round((1 - o["model_p"]) - no_ask - fee(no_ask), 4)
                rows.append(o)
            out[gm["game_key"]] = {"game": gm, "rows": rows}
    return out


def pick_ok(o):
    k = o["k"]
    return (o["model_p"] is not None and o["stat"] in PICK_STATS and o["n_games"] >= MIN_PREV_GAMES_PICK and
            not (o["injury"] and INJ_EXCLUDE.search(o["injury"])) and (k.get("oi") or 0) >= MIN_OPEN_INTEREST and
            k.get("bid") is not None and k.get("ask") is not None and 0 < k["bid"] < k["ask"] < 1 and
            k["ask"] - k["bid"] <= MAX_SPREAD and abs(o["model_p"] - o["k_mid"]) <= MAX_GAP)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    t0 = now_utc()
    prereg_sha = sha(PREREG) if os.path.exists(PREREG) else None
    prices = json.load(open(PRICES))
    scored = score_games(t0, prices)
    summary = {"games": len(scored), "rows": sum(len(v["rows"]) for v in scored.values()),
               "rows_scored": sum(o["model_p"] is not None for v in scored.values() for o in v["rows"]),
               "four_stat_rows_unscored": sum(o["model_p"] is None and o["stat"] in PICK_STATS
                                              for v in scored.values() for o in v["rows"]),
               "pick_eligible": sum(pick_ok(o) for v in scored.values() for o in v["rows"]),
               "locked_now": [], "picks_now": 0}
    if a.dry_run:
        for key, v in scored.items():
            ok = [o for o in v["rows"] if pick_ok(o)]
            evs = [(max(o.get("ev_over", -1), o.get("ev_under", -1)), o["player"], o["stat"], o["line"]) for o in ok]
            print(key, "rows", len(v["rows"]), "scored", sum(o["model_p"] is not None for o in v["rows"]),
                  "eligible", len(ok), "ev>=0.05", sum(e[0] >= MIN_EDGE for e in evs))
            unm = sorted({o["player"] for o in v["rows"] if o["model_p"] is None and o["stat"] in PICK_STATS})
            if unm:
                print("   unscored:", unm[:15])
        print(json.dumps(summary, indent=1))
        return
    c = db()
    c.execute("INSERT OR IGNORE INTO runs VALUES (?,?,?,?,?)", (iso(t0), prereg_sha, sha(MODEL), prices.get("generated_at"),
                                                                 "" if prereg_sha else "NO PREREG FILE -- nothing locked"))
    locked = {r[0] for r in c.execute("SELECT game_key FROM locked_games")}
    docs = []
    for key, v in scored.items():
        gm, rows_out = v["game"], v["rows"]
        kt = gm["kick"]
        in_window = kt - timedelta(hours=LOCK_WINDOW_START_H) <= t0 <= kt - timedelta(minutes=LOCK_WINDOW_END_MIN)
        if prereg_sha and in_window and key not in locked:
            n_rows, best = 0, {}
            for o in rows_out:
                k = o["k"]
                if o["model_p"] is None or k.get("ask") is None or k.get("bid") is None:
                    continue
                c.execute("INSERT OR IGNORE INTO locked_rows VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                          (key, o["player"], o["pid"], o["stat"], o["line"], o["model_p"], o["expected"],
                           o.get("blend_p"), o["n_games"], o["days_since"], o["n_out"], o["injury"] or "",
                           k.get("bid"), k.get("ask"), k.get("oi"), k.get("t"), k.get("e"), iso(t0)))
                n_rows += 1
                if not pick_ok(o):
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
            c.execute("INSERT INTO locked_games VALUES (?,?,?,?,?)", (key, iso(kt), iso(t0), n_rows, len(best)))
            summary["locked_now"].append(key); summary["picks_now"] += len(best)
        c.commit()
        picks = [dict(zip(["player", "stat", "line", "side", "price", "fee", "model_p", "ev", "lock_utc"], r)) for r in
                 c.execute("SELECT player,stat,line,side,price,fee,model_p,ev,lock_utc FROM picks WHERE game_key=?", (key,))]
        g = gm["doc"]
        data = {k2: g.get(k2) for k2 in ("game_key", "game_date", "away_team", "home_team", "kickoff_time")}
        data.update(sport="NBA", model="NBA_PROPS_MODEL_V2", prereg_sha256=prereg_sha, scored_utc=iso(t0),
                    locked=key in locked or key in summary["locked_now"], paper_picks=picks,
                    rows=[{kk: vv for kk, vv in o.items() if kk not in ("pid",)} for o in rows_out],
                    note="Model chance vs exchange price. Paper test only; nothing is bet. On past games Kalshi's price "
                         "was more right than this model; not proven to beat the market.")
        data["export_hash"] = hashlib.sha256(json.dumps({kk: vv for kk, vv in data.items() if kk != "scored_utc"},
                                                        sort_keys=True, default=str).encode()).hexdigest()
        docs.append({"collection": "props_model", "doc_id": key, "data": data})
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
    report = {"doc": "NBA_PROPS_MODEL_V2", "sport": "NBA", "updated_utc": iso(t0), "prereg_sha256": prereg_sha,
              "model_sha256": sha(MODEL), "paper_picks_graded": tally[0] or 0, "wins": tally[1] or 0,
              "profit_per_1_contract_sum": round(tally[2] or 0, 3), "cost_sum": round(tally[3] or 0, 3),
              "roi": round((tally[2] or 0) / tally[3], 4) if tally[3] else None,
              "backtest": "On 2025-26 Kalshi props Kalshi's price was more right than v2 (log loss 0.5559 vs 0.5634).",
              "note": "Paper test. Profit counts the ask price paid plus an estimated Kalshi fee. Graded by Kalshi's own settlement."}
    report["export_hash"] = hashlib.sha256(json.dumps({k2: v for k2, v in report.items() if k2 != "updated_utc"}, sort_keys=True).encode()).hexdigest()
    docs.append({"collection": "props_model_report", "doc_id": "NBA_PROPS_MODEL_V2", "data": report})
    json.dump({"sport": "NBA_PROPS_MODEL", "generated_at": iso(t0), "n_docs": len(docs), "summary": summary, "docs": docs},
              open(OUT, "w"), separators=(",", ":"), default=str)
    print(json.dumps(summary, indent=1), json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
