#!/usr/bin/env python3
"""
stats_cfb.py -- the Research section's college football files (FBS): DeVig's power rankings, team stats with league
ranks, and every player's averages and game log by position (QB, RB, WR, TE; DL, LB, DB), from ESPN's public
scoreboard, box scores and rosters. Display only: nothing here feeds a model, a pick or a test.

THIS SEASON ONLY. The Research Lab Constitution seals the 2025 college football season ("never stored anywhere in
the repo", Part C1), so nothing from 2025 or earlier is fetched or written: there is no last-season column, and the
power rating has no prior. CollegeFootballData is not used (its terms forbid publishing its data, C1a, and the lab
needs its monthly calls); ESPN's box scores are the same family of data as the NBA and WNBA files.

Each finished game's box score never changes, so it is fetched once and kept in the cache folder (the workflow keeps
that folder in the private Actions cache); a run fetches only new games, the week scoreboards and the rosters.

Output (stats/cfb/): index.json and team_<KEY>.json, the NFL files' layout (tools/stats_nfl.py), keyed by ESPN's team
abbreviation, as the app's college games are. Run by .github/workflows/stats.yml.
"""
import json
import os
import re
import sys
import tempfile
import time
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stats_common as S  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "stats", "cfb")
ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/"
UA = "DeVig research stats (github.com/DeVig-AI/AI-Bettor-Model)"
WEEKS = range(1, 17)                            # regular season weeks; bowls (season type 3) after
OFFENSE, DEFENSE = ["QB", "RB", "WR", "TE"], ["DL", "LB", "DB"]
POS_GROUP = {"QB": "QB", "RB": "RB", "FB": "RB", "TB": "RB", "WR": "WR", "TE": "TE",
             "DL": "DL", "DE": "DL", "DT": "DL", "NT": "DL", "EDGE": "DL",
             "LB": "LB", "OLB": "LB", "ILB": "LB", "MLB": "LB",
             "DB": "DB", "CB": "DB", "S": "DB", "FS": "DB", "SS": "DB", "SAF": "DB", "NB": "DB"}
LOG = ["cmp", "att", "pass_yds", "pass_td", "int", "car", "rush_yds", "rush_td", "rec", "tgt", "rec_yds", "rec_td"]
DLOG = ["tkl", "sk", "int_d", "pd", "tfl", "qbh", "ff"]
# the NFL files' page layout (the app reads it from index.json), with no last season
POS_COLS = {
    "QB": [["GP", "gp", 0], ["PASS", "pass_yds", 1], ["TD", "pass_td", 2], ["INT", "int", 2], ["RUSH", "rush_yds", 1]],
    "RB": [["GP", "gp", 0], ["CAR", "car", 1], ["RUSH", "rush_yds", 1], ["REC", "rec", 1], ["TD", "td_tot", 0]],
    "WR": [["GP", "gp", 0], ["REC", "rec", 1], ["REC YDS", "rec_yds", 1], ["TD", "td_tot", 0]],
    "DL": [["GP", "gp", 0], ["TKL", "tkl", 1], ["SACK", "sk", 2], ["TFL", "tfl", 2], ["QB HIT", "qbh", 2]],
    "LB": [["GP", "gp", 0], ["TKL", "tkl", 1], ["SACK", "sk", 2], ["TFL", "tfl", 2], ["PD", "pd", 2]],
    "DB": [["GP", "gp", 0], ["TKL", "tkl", 1], ["INT", "int_d", 2], ["PD", "pd", 2], ["TFL", "tfl", 2]],
}
POS_COLS["TE"] = POS_COLS["WR"]
CONFIG = {
    "rating_unit": "points",
    "rank_low": ["oppg", "oypg", "give"], "rank_skip": [],
    "search_cols": ["PASS", "RUSH", "REC YDS"],
    "team_rows": [["Record", "record"], ["Points per game", "ppg", 1], ["Allowed per game", "oppg", 1],
                  ["Average margin", "margin", 1, True], ["Yards per game", "ypg", 1], ["Passing yards per game", "pypg", 1],
                  ["Rushing yards per game", "rypg", 1], ["Yards allowed per game", "oypg", 1], ["Giveaways per game", "give", 2],
                  ["Takeaways per game", "take", 2], ["Sacks per game", "sacks", 2], ["Home", "home"], ["Away", "away"],
                  ["Last 5", "last5"]],
    "roster_units": [["Offense", OFFENSE], ["Defense", DEFENSE]],
    "group_names": {"QB": "Quarterbacks", "RB": "Running backs", "WR": "Wide receivers", "TE": "Tight ends",
                    "DL": "Defensive line", "LB": "Linebackers", "DB": "Secondary"},
    "group_cols": POS_COLS,
    "roster_cols": [["GP", "gp", 0], ["PASS", "pass_yds", 1], ["RUSH", "rush_yds", 1], ["REC YDS", "rec_yds", 1], ["TD", "td_tot", 0]],
    "player_cols": [["GP", "gp", 0], ["CMP", "cmp", 1], ["ATT", "att", 1], ["PASS YDS", "pass_yds", 1], ["PASS TD", "pass_td", 2],
                    ["INT", "int", 2], ["CAR", "car", 1], ["RUSH YDS", "rush_yds", 1], ["REC", "rec", 1],
                    ["REC YDS", "rec_yds", 1], ["TD", "td_tot", 0]],
    "player_note": "Per game this season (TD: total rushing and receiving touchdowns).",
    "player_cols_def": [["GP", "gp", 0], ["TKL", "tkl", 1], ["SACK", "sk", 2], ["TFL", "tfl", 2], ["QB HIT", "qbh", 2],
                        ["INT", "int_d", 2], ["PD", "pd", 2], ["FF", "ff", 2]],
    "player_note_def": "Per game this season (TKL: total tackles).",
    "log_show": [["PASS", "pass_yds"], ["CAR", "car"], ["RUSH", "rush_yds"], ["REC", "rec"], ["REC YDS", "rec_yds"]],
    "log_show_def": [["TKL", "tkl"], ["SACK", "sk"], ["TFL", "tfl"], ["INT", "int_d"], ["PD", "pd"]],
    "hit_stats": [["passing_yards", "Passing yards", ["pass_yds"]], ["passing_tds", "Passing TDs", ["pass_td"]],
                  ["passing_completions", "Completions", ["cmp"]], ["rushing_yards", "Rushing yards", ["rush_yds"]],
                  ["rushing_attempts", "Rush attempts", ["car"]], ["receptions", "Receptions", ["rec"]],
                  ["receiving_yards", "Receiving yards", ["rec_yds"]], ["rush_rec_yards", "Rush + rec yards", ["rush_yds", "rec_yds"]],
                  ["touchdowns", "Rush + rec TDs", ["rush_td", "rec_td"]]],
    "hit_stats_def": [["tackles", "Tackles", ["tkl"]], ["sacks", "Sacks", ["sk"]],
                      ["def_interceptions", "Interceptions", ["int_d"]], ["passes_defended", "Passes defended", ["pd"]]],
}


def season_of(now):
    """College football seasons go by the year they start (the 2026 season's bowls are in January 2027)."""
    return now.year if now.month >= 8 else now.year - 1


def key_of(code):
    """A team's file key: its ESPN abbreviation with anything but letters and digits as '_' (TA&M -> TA_M)."""
    return re.sub(r"[^A-Z0-9]", "_", str(code).upper())


def num(v):
    try:
        f = float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return 0.0
    return f if f == f else 0.0


def whole(v):
    """A game-log value: whole numbers as ints (half sacks stay 0.5)."""
    return int(v) if v == int(v) else round(v, 1)


class Espn:
    """GETs ESPN JSON; box scores of finished games are kept in `cache` and never fetched twice."""

    def __init__(self, cache, fetch=None, pause=0.25):
        self.cache, self.pause, self.calls = cache, pause, 0
        self._fetch = fetch or self._http
        os.makedirs(os.path.join(cache, "summary"), exist_ok=True)

    def _http(self, url):
        for i in range(4):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=30) as r:
                    return json.loads(r.read().decode("utf-8"))
            except Exception as e:                  # a slow or busy moment: back off and try again
                if i == 3:
                    raise
                print(f"retry {url}: {type(e).__name__}")
                time.sleep(2 * (i + 1))

    def get(self, path):
        self.calls += 1
        data = self._fetch(ESPN + path)
        if self.pause:
            time.sleep(self.pause)
        return data

    def summary(self, event_id):
        path = os.path.join(self.cache, "summary", f"{event_id}.json")
        if os.path.exists(path):
            with open(path) as f:
                return json.load(f)
        d = self.get(f"summary?event={event_id}")
        with open(path, "w") as f:
            json.dump({"boxscore": d.get("boxscore") or {}}, f)       # only the box score is kept
        return {"boxscore": d.get("boxscore") or {}}


def fbs_teams(api):
    """{ESPN team id: {code, name, color}} for FBS (group 80)."""
    d = api.get("teams?groups=80&limit=1000")
    out = {}
    for lg in d.get("sports", [{}])[0].get("leagues", [{}]):
        for t in lg.get("teams", []):
            t = t.get("team", t)
            if t.get("id") and t.get("abbreviation"):
                out[str(t["id"])] = {"code": key_of(t["abbreviation"]), "name": t.get("displayName") or t.get("location") or t["abbreviation"],
                                     "color": "#" + t["color"] if re.fullmatch(r"[0-9a-fA-F]{6}", str(t.get("color") or "")) else None}
    return out


def is_done(ev):
    comp = (ev.get("competitions") or [{}])[0]
    return bool(((comp.get("status") or ev.get("status") or {}).get("type") or {}).get("completed"))


def finished_games(api, y, fbs):
    """Season y's finished games with an FBS team: [{id, date, home, away (ESPN ids), home_pts, away_pts, type, abbr}]."""
    out, seen = [], set()
    for st, weeks in ((2, WEEKS), (3, [1])):
        for w in weeks:
            d = api.get(f"scoreboard?groups=80&seasontype={st}&week={w}&dates={y}&limit=500")
            evs = d.get("events") or []
            for ev in evs:
                comp = (ev.get("competitions") or [{}])[0]
                side = {c.get("homeAway"): c for c in comp.get("competitors") or []}
                if not is_done(ev) or ev.get("id") in seen or "home" not in side or "away" not in side:
                    continue
                h, a = str(side["home"]["team"]["id"]), str(side["away"]["team"]["id"])
                if h not in fbs and a not in fbs:
                    continue
                seen.add(ev["id"])
                abbr = {str(c["team"]["id"]): key_of(c["team"].get("abbreviation") or "") for c in side.values()}
                out.append({"id": str(ev["id"]), "date": str(ev.get("date", ""))[:10], "home": h, "away": a, "abbr": abbr,
                            "home_pts": int(num(side["home"].get("score"))), "away_pts": int(num(side["away"].get("score"))),
                            "type": "R" if st == 2 else "P", "neutral": bool(comp.get("neutralSite"))})
            if st == 2 and evs and not any(is_done(e) for e in evs) and w > 1:
                break                                # the first week with no finished game: the rest are ahead
    return sorted(out, key=lambda g: (g["date"], g["id"]))


def team_stats(box):
    """{ESPN team id: {stat name: value}} from a box score's team statistics."""
    out = {}
    for t in box.get("teams") or []:
        tid = str((t.get("team") or {}).get("id"))
        s = {}
        for x in t.get("statistics") or []:
            s[x.get("name")] = x.get("displayValue")
        out[tid] = s
    return out


def player_lines(box):
    """{(ESPN team id, athlete id): {name, stats...}} for one game, the NFL tool's stat names."""
    out = {}
    for tm in box.get("players") or []:
        tid = str((tm.get("team") or {}).get("id"))
        for grp in tm.get("statistics") or []:
            keys, name = grp.get("keys") or [], grp.get("name")
            for a in grp.get("athletes") or []:
                ath = a.get("athlete") or {}
                if not ath.get("id"):
                    continue
                v = dict(zip(keys, a.get("stats") or []))
                p = out.setdefault((tid, str(ath["id"])), {"name": ath.get("displayName") or "", **{k: 0.0 for k in LOG + DLOG}})
                if name == "passing":
                    ca = str(v.get("completions/passingAttempts", "")).split("/")
                    if len(ca) == 2:
                        p["cmp"], p["att"] = num(ca[0]), num(ca[1])
                    p["pass_yds"], p["pass_td"], p["int"] = num(v.get("passingYards")), num(v.get("passingTouchdowns")), num(v.get("interceptions"))
                elif name == "rushing":
                    p["car"], p["rush_yds"], p["rush_td"] = num(v.get("rushingAttempts")), num(v.get("rushingYards")), num(v.get("rushingTouchdowns"))
                elif name == "receiving":
                    p["rec"], p["rec_yds"], p["rec_td"] = num(v.get("receptions")), num(v.get("receivingYards")), num(v.get("receivingTouchdowns"))
                    p["tgt"] = num(v.get("receivingTargets"))
                elif name == "defensive":
                    p["tkl"] = num(v.get("totalTackles")) or num(v.get("soloTackles")) + num(v.get("assistTackles"))
                    p["sk"], p["tfl"], p["pd"], p["qbh"] = num(v.get("sacks")), num(v.get("tacklesForLoss")), num(v.get("passesDefended")), num(v.get("QBHits"))
                elif name == "interceptions":
                    p["int_d"] = num(v.get("interceptions"))
                elif name == "fumbles":
                    p["ff"] = num(v.get("fumblesForced"))
    return out


def roster(api, tid):
    """{athlete id: (position abbreviation, group)} from the team's roster."""
    try:
        d = api.get(f"teams/{tid}/roster")
    except Exception as e:                       # a roster that won't load: its players are grouped by their stats
        print(f"roster {tid}: {type(e).__name__}")
        return {}
    out = {}
    for sec in d.get("athletes") or []:
        for a in (sec.get("items") or [sec]):
            pos = str(((a.get("position") or {}).get("abbreviation")) or "").upper()
            if a.get("id"):
                out[str(a["id"])] = (pos, POS_GROUP.get(pos))
    return out


def guess_group(s):
    """No roster position: offense by what a player did most; defense by tackles."""
    if s["att"] >= 5:
        return "QB"
    if s["car"] >= max(1, s["rec"]):
        return "RB"
    if s["rec"] > 0:
        return "WR"
    if s["tkl"] or s["sk"] or s["int_d"] or s["pd"]:            # coverage with no pass rush: a DB; else a linebacker
        return "DB" if (s["int_d"] or s["pd"]) and not (s["sk"] or s["tfl"]) else "LB"
    return None


def records(rows):
    w = sum(1 for r in rows if r["f"] > r["a"])
    l = sum(1 for r in rows if r["f"] < r["a"])
    return f"{w}-{l}"


def build(now, cache, fetch=None, pause=0.25):
    y = season_of(now)
    api = Espn(cache, fetch, pause)
    fbs = fbs_teams(api)
    games = finished_games(api, y, fbs)
    rows = {tid: [] for tid in fbs}               # per FBS team, oldest first: {f, a, ha, opp, ...}
    for g in games:
        for me, op, ha, f, a in ((g["home"], g["away"], "N" if g["neutral"] else "H", g["home_pts"], g["away_pts"]),
                                 (g["away"], g["home"], "N" if g["neutral"] else "A", g["away_pts"], g["home_pts"])):
            if me in rows:
                rows[me].append({"g": g, "opp": op, "ha": ha, "f": f, "a": a})
    ratings, _ = S.srs([(g["home"], g["away"], g["home_pts"] - g["away_pts"]) for g in games
                        if g["type"] == "R" and g["home"] in fbs and g["away"] in fbs], sorted(fbs))
    order = sorted(fbs, key=lambda t: -ratings.get(t, 0.0))
    rank = {t: i + 1 for i, t in enumerate(order)}
    code = {tid: v["code"] for tid, v in fbs.items()}

    def opp_code(tid, g):                         # an FCS opponent keeps ESPN's abbreviation
        return code.get(tid) or g["abbr"].get(tid) or "FCS"

    ts, logs = {}, {}
    for tid, rs in rows.items():
        reg = [r for r in rs if r["g"]["type"] == "R"]
        own, opp = [], []
        for r in rs:
            box = api.summary(r["g"]["id"])["boxscore"]
            st = team_stats(box)
            own.append((r, st.get(tid, {})))
            opp.append((r, st.get(r["opp"], {})))
            for (t, aid), p in player_lines(box).items():
                if t == tid:
                    logs.setdefault((tid, aid), []).append((r, p))

        def avg(pairs, fn):
            v = [fn(s) for r, s in pairs if r["g"]["type"] == "R" and s]
            return S.r1(sum(v) / len(v), 2) if v else None

        def sacks(s):                             # ESPN gives a team's sacks taken as "3-21" (sacks-yards)
            return num(str(s.get("sacksYardsLost", "0-0")).split("-")[0])
        res = ["W" if r["f"] > r["a"] else "L" if r["f"] < r["a"] else "T" for r in reg]
        n = len(reg)
        last5 = res[-5:]
        ts[tid] = {
            "gp": n, "record": records(reg), "w": res.count("W"), "l": res.count("L"),
            "last5": f"{last5.count('W')}-{last5.count('L')}",
            "home": records([r for r in reg if r["ha"] == "H"]), "away": records([r for r in reg if r["ha"] == "A"]),
            "ppg": S.r1(sum(r["f"] for r in reg) / n) if n else None, "oppg": S.r1(sum(r["a"] for r in reg) / n) if n else None,
            "margin": S.r1(sum(r["f"] - r["a"] for r in reg) / n) if n else None,
            "ypg": avg(own, lambda s: num(s.get("totalYards"))), "pypg": avg(own, lambda s: num(s.get("netPassingYards"))),
            "rypg": avg(own, lambda s: num(s.get("rushingYards"))), "oypg": avg(opp, lambda s: num(s.get("totalYards"))),
            "give": avg(own, lambda s: num(s.get("turnovers"))), "take": avg(opp, lambda s: num(s.get("turnovers"))),
            "sacks": avg(opp, sacks),
            "games": [[r["g"]["date"], opp_code(r["opp"], r["g"]), r["ha"], r["f"], r["a"],
                       "W" if r["f"] > r["a"] else "L" if r["f"] < r["a"] else "T", r["g"]["type"], y + 1, ""] for r in rs][::-1]}
    ranks = S.league_ranks({t: ts[t] for t in ts if ts[t]["gp"]}, CONFIG["team_rows"], CONFIG["rank_low"], CONFIG["rank_skip"])

    stamp = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    search = []
    order_grp = {g: i for i, g in enumerate(OFFENSE + DEFENSE)}
    for tid in fbs:
        pos = roster(api, tid) if rows[tid] else {}
        players = []
        for (t, aid), entries in logs.items():
            if t != tid:
                continue
            reg = [p for r, p in entries if r["g"]["type"] == "R"]
            tot = {k: sum(p[k] for p in reg) for k in LOG + DLOG}
            n = len(reg)
            p_pos, grp = pos.get(aid, ("", None))
            grp = grp or guess_group(tot)
            if not grp or not n:
                continue
            d = grp in DEFENSE
            this = {"gp": n, **{k: S.r1(tot[k] / n, 1 if k == "tkl" else 2) for k in DLOG}} if d else \
                {"gp": n, "td_tot": int(tot["rush_td"] + tot["rec_td"]),
                 **{k: S.r1(tot[k] / n, 2 if k in ("pass_td", "int", "rush_td", "rec_td") else 1) for k in LOG}}
            log = [[r["g"]["date"], opp_code(r["opp"], r["g"]), r["ha"]] + [whole(p[k]) for k in LOG + DLOG] + [r["g"]["type"], y + 1]
                   for r, p in entries][::-1]
            pl = {"id": aid, "name": entries[-1][1]["name"], "pos": p_pos or grp, "grp": grp, "this": this, "last": None, "log": log}
            players.append(pl)
            search.append([aid, pl["name"], code[tid], pl["pos"], n, this.get("pass_yds"), this.get("rush_yds"), this.get("rec_yds"), y + 1])

        def depth(pl):
            s = pl["this"]
            return -(s.get("tkl") or 0) if pl["grp"] in DEFENSE else -(s.get("pass_yds", 0) + s.get("rush_yds", 0) + s.get("rec_yds", 0))
        players.sort(key=lambda pl: (order_grp.get(pl["grp"], 9), depth(pl)))
        this = ts.get(tid) or {}
        S.write(os.path.join(OUT, f"team_{code[tid]}.json"), {
            "generated_at": stamp, "code": code[tid], "name": fbs[tid]["name"], "color": fbs[tid]["color"], "rank": rank[tid],
            "rating": S.r1(ratings.get(tid)), "season": str(y), "last_season": "—", "season_year": y + 1,
            "this": {f: v for f, v in this.items() if f != "games"} if this.get("gp") else None, "ranks": ranks.get(tid) or None,
            "last": None, "games": this.get("games", []), "players": players})
    teams = []
    for tid in order:
        s = ts.get(tid) or {}
        teams.append({"code": code[tid], "name": fbs[tid]["name"], "color": fbs[tid]["color"], "rank": rank[tid],
                      "rating": S.r1(ratings.get(tid)), "rating_this": S.r1(ratings.get(tid)), "rating_last": None,
                      "last10": s.get("last5"), **{f: s.get(f) for f in ("gp", "w", "l", "record", "ppg", "oppg", "margin")}})
    search.sort(key=lambda r: -max(r[5] or 0, r[6] or 0, r[7] or 0))
    S.write(os.path.join(OUT, "index.json"), {
        "generated_at": stamp, "sport": "CFB", "season": str(y), "last_season": "—", "season_year": y + 1, "rank_last": "Last 5",
        "rating_note": "Points per game better than an average FBS team, adjusted for who each team played (SRS), this season only.",
        "source": "ESPN scoreboards, box scores and rosters (FBS). This season only: the 2025 season is sealed for the research lab.",
        "log_cols": ["date", "opp", "ha"] + LOG + DLOG + ["type", "season"], **CONFIG,
        "teams": teams, "players": search})
    return {"teams": len(fbs), "games": len(games), "players": len(search), "calls": api.calls}


def main():
    cache = os.getenv("CFB_ESPN_CACHE") or tempfile.mkdtemp()
    out = build(datetime.now(timezone.utc), cache)
    print(f"CFB research files: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
