#!/usr/bin/env python3
"""
lab_live.py -- the Research Lab's NHL and college football search leaders, run forward on this season's games, for
the app's "DeVig Lab" pick (labeled "new, not proven"). Display and comparison only: nothing here is bet, and nothing
here feeds the Lab, its tests or DeVig's own trackers.

The models are the registered Lab candidates, run with the Lab's own code (research.lab.models.run), unchanged:
  NHL  research/nhl/candidates/s-b7ed7469.yaml  a blend of three Elo models (the line is not an input). The Lab scores
       moneylines by which side of the fair close the model leans (D3), which ignores calibration, and the search
       settled on a large home bonus (110 Elo): its raw chances average 65% for the home team, who win 54-56%. So
       the app's win chance is the raw chance recalibrated, logit -> logistic, fit once on the Lab's training
       seasons 2012-13 (NHL_CAL below; `python3 tools/lab_live.py fit` re-derives it from the pinned archive, kept
       to seasons <= 2013 the moment it is read). Checked on 2023-26 finals, which the fit never saw: log loss 0.673
       (raw 0.698; always the home rate 0.690), every 10-point band within ~2 points of what happened.
  CFB  research/cfb/candidates/s-a543cfcd.yaml  expected home margin (SRS + per-play signals); its win chance comes
       from a logistic fit of margin -> home win on the Lab's training seasons only (as the Lab's A3.4 does)

Sealed seasons are never read (Constitution A8: only the Inspector General's exam downloads them):
  NHL  the ratings start from average in 2022-23 and run through every final since, from the NHL's public API
       (api.nhle.com, no key). The Lab's archive (to 2020-21) and the sealed 2021-22 season are not used.
  CFB  the Lab's own private cache (2009-2024, Actions cache only, C1a) plus the weekly current-season refresh
       (research/cfb/current/<season>/); the sealed 2025 season is skipped, so 2026 follows 2024. CollegeFootballData
       data is never committed: only each upcoming game's forecast is (live/lab/cfb.json). No API call is made here.

Out: live/lab/nhl.json and live/lab/cfb.json -- {generated_at, candidate, check (the Lab's confirmation result, when
there is one), data_through, games: [{game_id, kickoff, date, home, away, home_name, away_name, home_wp,
home_line?}]} for games not started yet. tools/models_compare.py reads these as the "lab" model, locks the last
number before each start and grades it like every other model.

Usage:  python3 tools/lab_live.py [nhl] [cfb]      (default: both; CFB is skipped when its cache isn't there)
        python3 tools/lab_live.py fit               (re-derive NHL_CAL)
"""
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)
OUT = os.path.join(ROOT, "live", "lab")
ET = ZoneInfo("America/New_York")
UA = "devig-lab-live/1.0 (personal research; read-only)"
NHL_API = "https://api.nhle.com/stats/rest/en"
NHL_FIRST = 2022                       # first season the live NHL ratings learn from (2022-23): after the sealed 2021
NHL_ALIAS = {"ARI": "UTA"}             # Arizona's players and staff moved to Utah in 2024: one rating
CANDIDATE = {"NHL": "s-b7ed7469", "CFB": "s-a543cfcd"}
NHL_CAL = (-0.513122, 1.167261)        # (intercept, slope) on logit(raw), 2,127 training games 2012-13
AHEAD = {"NHL": timedelta(days=3), "CFB": timedelta(days=10)}


def get(url, tries=3):
    last = None
    for _ in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:                       # noqa: BLE001 -- retried, then raised
            last = e
    raise RuntimeError(f"{url}: {last}")


def iso(t):
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def candidate(sport):
    import yaml
    path = os.path.join(ROOT, "research", sport.lower(), "candidates", f"{CANDIDATE[sport]}.yaml")
    with open(path) as f:
        return yaml.safe_load(f), os.path.relpath(path, ROOT)


def check(sport, cid):
    """The Lab's confirmation result for the candidate, from research/status.json (None until it has run)."""
    try:
        with open(os.path.join(ROOT, "research", "status.json")) as f:
            st = json.load(f)
    except (OSError, ValueError):
        return None
    for c in ((st.get("by_sport") or {}).get(sport) or {}).get("candidates") or []:
        if c.get("id") == cid:
            keep = ("state", "fail_reason", "gates", "pooled", "holm_p", "started_at")
            return {k: c[k] for k in keep if k in c}
    return None


def write(sport, payload):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{sport.lower()}.json")
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(payload, f, indent=1, sort_keys=True)
        f.write("\n")
    os.replace(tmp, path)
    print(f"{sport}: {len(payload['games'])} upcoming games -> {os.path.relpath(path, ROOT)}")


# ================================================================ NHL

def nhl_season_start(now):
    return now.year if now.month >= 8 else now.year - 1


def nhl_games(now):
    """Every regular-season and playoff game from 2022-23 to this season (finals scored, the rest unplayed), in the
    Lab's game table shape, plus {game_id: (home full name, away full name, start)} for matching ESPN's games."""
    import pandas as pd
    teams = {t["id"]: (t["triCode"], t["fullName"]) for t in get(f"{NHL_API}/team")["data"]}
    rows, extra = [], {}
    for s in range(NHL_FIRST, nhl_season_start(now) + 1):
        d = get(f"{NHL_API}/game?cayenneExp=season={s}{s + 1}%20and%20gameType%3E=2")["data"]
        for g in d:
            if g.get("gameType") not in (2, 3) or g["homeTeamId"] not in teams or g["visitingTeamId"] not in teams:
                continue
            (hc, hn), (ac, an) = teams[g["homeTeamId"]], teams[g["visitingTeamId"]]
            hc, ac = NHL_ALIAS.get(hc, hc), NHL_ALIAS.get(ac, ac)
            final = g.get("gameStateId") in (6, 7)
            start = datetime.fromisoformat(g["easternStartTime"]).replace(tzinfo=ET)
            gid = str(g["id"])
            rows.append({"game_id": gid, "season": s, "game_type": "REG", "gameday": g["gameDate"],
                         "gametime": start.strftime("%H:%M"), "home_team": hc, "away_team": ac,
                         "home_score": g["homeScore"] if final else None, "away_score": g["visitingScore"] if final else None,
                         "location": "Home", "home_rest": 0, "away_rest": 0,
                         "spread_line": None, "total_line": None, "ml_line": None})
            extra[gid] = (hn, an, start, hc, ac)
    games = pd.DataFrame(rows)
    first = games.groupby("season").gameday.transform("min")
    games["week"] = ((pd.to_datetime(games.gameday) - pd.to_datetime(first)).dt.days // 7 + 1).astype(int)
    return games, extra


def run_nhl(now):
    os.environ["LAB_SPORT"] = "NHL"
    from research.lab import config as C
    C.use("NHL")
    from research.lab import models
    cand, path = candidate("NHL")
    games, extra = nhl_games(now)
    import pandas as pd
    data = {"games": games, "team_games": pd.DataFrame(), "qb_games": pd.DataFrame()}
    out, _ = models.run(cand, data)
    fc = dict(zip(out.game_id, out.forecast))
    import numpy as np
    done = games[games.home_score.notna()]
    up = []
    for g in games[games.home_score.isna()].itertuples():
        hn, an, start, hc, ac = extra[g.game_id]
        if not (now < start <= now + AHEAD["NHL"]) or pd.isna(fc.get(g.game_id)):
            continue
        up.append({"game_id": g.game_id, "kickoff": iso(start), "date": g.gameday, "home": hc, "away": ac,
                   "home_name": hn, "away_name": an, "home_wp": round(nhl_cal(float(fc[g.game_id]) / 100), 4),
                   "raw_home_wp": round(float(fc[g.game_id]) / 100, 4)})
    up.sort(key=lambda x: (x["kickoff"], x["game_id"]))
    write("NHL", {"generated_at": iso(now), "sport": "NHL", "candidate": {"id": cand["id"], "file": path, "name": cand["name"],
                  "market": cand["market"], "search": cand.get("search")},
                  "check": check("NHL", cand["id"]), "data_from": f"{NHL_FIRST}-{NHL_FIRST + 1 - 2000:02d} season",
                  "data_through": done.gameday.max() if len(done) else None, "finals_used": int(len(done)),
                  "calibration": {"intercept": NHL_CAL[0], "slope": NHL_CAL[1], "on": "logit of the raw chance",
                                  "fit_seasons": "2012-2013", "fit_games": 2127},
                  "source": "NHL public API (api.nhle.com)", "games": up})


def nhl_cal(p, cal=NHL_CAL):
    import math
    p = min(max(p, 1e-6), 1 - 1e-6)
    return 1 / (1 + math.exp(-(cal[0] + cal[1] * math.log(p / (1 - p)))))


def fit_nhl():
    """Re-derive NHL_CAL: the pinned archive (as the Lab's cache builder reads it), kept to seasons <= 2013 at once."""
    os.environ["LAB_SPORT"] = "NHL"
    from research.lab import config as C, models, sbr_data as S
    import numpy as np
    C.use("NHL")
    g, _ = S.parse(S.download(), "NHL")
    g = g[g.season <= C.TRAIN[1]].reset_index(drop=True)
    cand, _ = candidate("NHL")
    out, _ = models.run(cand, {"games": g})
    tr = out[(out.season >= C.TRAIN[0]) & (out.season <= C.TRAIN[1]) & out.actual.notna()]
    p = np.clip(tr.forecast.values / 100, 1e-6, 1 - 1e-6)
    a, b = models._logistic(np.log(p / (1 - p)), (tr.actual.values > 0).astype(float))
    print(f"NHL_CAL = ({a:.6f}, {b:.6f})  from {len(tr)} games {C.TRAIN[0]}-{C.TRAIN[1]}")


# ================================================================ CFB

def run_cfb(now):
    os.environ["LAB_SPORT"] = "CFB"
    from research.lab import config as C
    C.use("CFB")
    from research.lab import cfb_data as D, models
    import numpy as np
    import pandas as pd
    season = D.current_season(now.date())
    cur = os.path.join(C.CFB_DIR, "current", str(season))
    if season <= C.SEALED_SEASON or not all(os.path.exists(D._path(p, "games")) for p in (C.DATA_DIR, cur)):
        print(f"CFB: no lab cache or no {season} refresh here: skipped")
        return False
    t = {}
    for k in D.KINDS:
        lab = D._read(C.DATA_DIR, k)
        lab = lab[pd.to_numeric(lab.season, errors="coerce") <= C.LAB_MAX_SEASON]      # never the sealed season
        t[k] = pd.concat([lab, D._read(cur, k)], ignore_index=True)
    data = D.assemble(t)
    if (data["games"].season == C.SEALED_SEASON).any():
        raise RuntimeError("sealed season rows reached the live CFB model")
    cand, path = candidate("CFB")
    out, _ = models.run(cand, data)
    # margin -> home win chance, fit once on the Lab's training seasons (A3.4's rule for margin models)
    tr = ((out.season >= C.TRAIN[0]) & (out.season <= C.TRAIN[1]) & out.actual.notna() & (out.actual != 0)).values
    a, b = models._logistic(out.forecast.values[tr].astype(float), (out.actual.values[tr] > 0).astype(float))
    g = data["games"].set_index("game_id")
    raw = t["games"].drop_duplicates("game_id").assign(game_id=lambda x: x.game_id.astype(str)).set_index("game_id")
    up = []
    for r in out[out.actual.isna() & (out.season == season)].itertuples():
        if pd.isna(r.forecast):
            continue
        start = pd.Timestamp(raw.loc[r.game_id, "start"]) if r.game_id in raw.index else None
        if start is None or pd.isna(start):
            continue
        start = start.tz_convert("UTC").to_pydatetime() if start.tzinfo else start.tz_localize("UTC").to_pydatetime()
        if not (now < start <= now + AHEAD["CFB"]):
            continue
        x = g.loc[r.game_id]
        wp = 1 / (1 + np.exp(-np.clip(a + b * float(r.forecast), -30, 30)))
        up.append({"game_id": str(r.game_id), "kickoff": iso(start), "date": x.gameday, "home": x.home_team,
                   "away": x.away_team, "home_name": x.home_team, "away_name": x.away_team,
                   "neutral": x.location == "Neutral", "home_wp": round(float(wp), 4),
                   "home_line": round(-float(r.forecast), 1)})
    up.sort(key=lambda x: (x["kickoff"], x["game_id"]))
    done = data["games"][(data["games"].season == season) & data["games"].home_score.notna()]
    write("CFB", {"generated_at": iso(now), "sport": "CFB", "candidate": {"id": cand["id"], "file": path, "name": cand["name"],
                  "market": cand["market"], "search": cand.get("search")},
                  "check": check("CFB", cand["id"]), "win_chance_fit": {"intercept": round(a, 6), "per_point": round(b, 6),
                  "fit_seasons": f"{C.TRAIN[0]}-{C.TRAIN[1]}", "fit_games": int(tr.sum())},
                  "data_through": done.gameday.max() if len(done) else None, "finals_used": int(len(done)),
                  "source": "CollegeFootballData via the Lab's private cache (2009-2024) + the weekly current-season refresh; "
                            "sealed 2025 skipped", "games": up})
    return True


def main(argv):
    now = datetime.now(timezone.utc)
    if os.environ.get("LAB_LIVE_NOW"):
        now = datetime.fromisoformat(os.environ["LAB_LIVE_NOW"].replace("Z", "+00:00"))
    if argv[:1] == ["fit"]:
        fit_nhl()
        return 0
    which = [a.upper() for a in argv] or ["NHL", "CFB"]
    bad = 0
    for sport in which:
        try:
            (run_nhl if sport == "NHL" else run_cfb)(now)
        except Exception as e:                       # noqa: BLE001 -- one sport failing must not stop the other
            bad += 1
            print(f"{sport}: failed: {type(e).__name__}: {e}")
    return 1 if bad == len(which) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
