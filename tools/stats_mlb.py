#!/usr/bin/env python3
"""
stats_mlb.py -- the Research section's MLB files: DeVig's power rankings, team stats with league ranks, and every
player's season line (hitters; starting and relief pitchers), this season and last, with a game log of his team's last
10 games, from MLB's public Stats API (statsapi.mlb.com, the source the MLB tracker already uses). Display only: nothing
here feeds a model, a pick or a test.

Requests: one schedule per season (every game and score), team and player season stats per group (a few calls), and
the box scores of each team's last 10 finished games for the logs. A finished game's box score never changes, so it is
fetched once and kept in the cache folder (the workflow keeps it in the private Actions cache).

Output (stats/mlb/): index.json and team_<CODE>.json, the layout of the other sports' files, keyed by the app's MLB
team codes (kalshi_games_v1's: ARI, CHW, KC, SD, SF, TB, WSH, ATH, LAA...). Run by .github/workflows/stats.yml.
"""
import json
import os
import sys
import tempfile
import time
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stats_common as S  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "stats", "mlb")
API = "https://statsapi.mlb.com/api/v1/"
UA = "DeVig research stats (github.com/DeVig-AI/AI-Bettor-Model)"
LOG_GAMES = 10                                   # box scores per team for the logs: its last 10 finished games
TYPES = {"R": "R", "F": "P", "D": "P", "L": "P", "W": "P"}      # regular season; wild card, division, LCS, World Series
# Stats API abbreviations -> the app's (kalshi_games_v1.ALIASES, MLB side)
ALIASES = {"AZ": "ARI", "CWS": "CHW", "KCR": "KC", "SDP": "SD", "SFG": "SF", "TBR": "TB", "WAS": "WSH", "OAK": "ATH", "ANA": "LAA"}
HITTERS, PITCHERS = ["C", "IF", "OF", "DH"], ["SP", "RP"]
POS_GROUP = {"C": "C", "1B": "IF", "2B": "IF", "3B": "IF", "SS": "IF", "IF": "IF", "LF": "OF", "CF": "OF", "RF": "OF", "OF": "OF",
             "DH": "DH", "TWP": "DH", "P": "P"}
# batting, then pitching: ip as baseball writes it (6.2 = 6 and 2/3), outs for counting, k = strikeouts thrown
LOG = ["ab", "h", "hr", "rbi", "r", "bb", "so", "tb", "ip", "outs", "k", "er", "ha"]
GROUP_COLS = {
    "C": [["G", "gp", 0], ["AVG", "avg"], ["HR", "hr", 0], ["RBI", "rbi", 0], ["OPS", "ops"]],
    "SP": [["GS", "gs", 0], ["ERA", "era"], ["IP", "ip"], ["K", "k", 0], ["WHIP", "whip"]],
    "RP": [["G", "gp", 0], ["ERA", "era"], ["SV", "sv", 0], ["K", "k", 0], ["WHIP", "whip"]],
}
GROUP_COLS["IF"] = GROUP_COLS["OF"] = GROUP_COLS["DH"] = GROUP_COLS["C"]
CONFIG = {
    "rating_unit": "runs",
    "rank_low": ["rapg", "era", "whip"], "rank_skip": [],
    "search_cols": ["HR", "RBI", "K"],
    "team_rows": [["Record", "record"], ["Runs per game", "rpg", 2], ["Allowed per game", "rapg", 2],
                  ["Run differential per game", "margin", 2, True], ["Batting average", "avg"], ["On-base %", "obp"],
                  ["Slugging %", "slg"], ["OPS", "ops"], ["Home runs per game", "hrpg", 2], ["Team ERA", "era"],
                  ["WHIP", "whip"], ["Strikeouts per 9", "k9", 1], ["Home", "home"], ["Away", "away"], ["Last 10", "last10"]],
    "roster_units": [["Hitters", HITTERS], ["Pitchers", PITCHERS]],
    "group_names": {"C": "Catchers", "IF": "Infielders", "OF": "Outfielders", "DH": "Designated hitters",
                    "SP": "Starting pitchers", "RP": "Relief pitchers"},
    "group_cols": GROUP_COLS,
    "roster_cols": [["G", "gp", 0], ["AVG", "avg"], ["HR", "hr", 0], ["RBI", "rbi", 0], ["OPS", "ops"]],
    "player_cols": [["G", "gp", 0], ["AB", "ab", 0], ["H", "h", 0], ["HR", "hr", 0], ["RBI", "rbi", 0], ["R", "r", 0],
                    ["BB", "bb", 0], ["SO", "so", 0], ["AVG", "avg"], ["OBP", "obp"], ["SLG", "slg"], ["OPS", "ops"]],
    "player_note": "Season totals, regular season. Game log: his team's last 10 games.",
    "player_cols_def": [["G", "gp", 0], ["GS", "gs", 0], ["W", "w", 0], ["L", "l", 0], ["SV", "sv", 0], ["IP", "ip"],
                        ["K", "k", 0], ["BB", "bb", 0], ["ERA", "era"], ["WHIP", "whip"]],
    "player_note_def": "Season totals, regular season. Game log: his team's last 10 games.",
    "log_show": [["AB", "ab"], ["H", "h"], ["HR", "hr"], ["RBI", "rbi"], ["BB", "bb"]],
    "log_show_def": [["IP", "ip"], ["K", "k"], ["ER", "er"], ["H", "ha"]],
    "hit_stats": [["hits", "Hits", ["h"]], ["total_bases", "Total bases", ["tb"]], ["home_runs", "Home runs", ["hr"]],
                  ["rbis", "RBIs", ["rbi"]], ["runs", "Runs", ["r"]], ["hits_runs_rbis", "Hits + runs + RBIs", ["h", "r", "rbi"]],
                  ["batter_strikeouts", "Strikeouts (batting)", ["so"]]],
    "hit_stats_def": [["pitcher_strikeouts", "Strikeouts", ["k"]], ["earned_runs", "Earned runs", ["er"]],
                      ["hits_allowed", "Hits allowed", ["ha"]], ["outs", "Outs recorded", ["outs"]]],
}


def season_of(now):
    """The season under way or just finished: this year from March, last year before."""
    return now.year if now.month >= 3 else now.year - 1


def code(a):
    a = str(a or "").upper()
    return ALIASES.get(a, a)


def num(v):
    try:
        f = float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return 0.0
    return f if f == f else 0.0


def ip_outs(ip):
    """'6.2' innings -> 20 outs."""
    s = str(ip or "0")
    whole, _, part = s.partition(".")
    return int(num(whole)) * 3 + int(num(part or 0))


def ip_text(outs):
    return f"{outs // 3}.{outs % 3}"


class Api:
    """GETs Stats API JSON; finished games' box scores are kept in `cache` and never fetched twice."""

    def __init__(self, cache, fetch=None, pause=0.2):
        self.cache, self.pause, self.calls = cache, pause, 0
        self._fetch = fetch or self._http
        os.makedirs(os.path.join(cache, "box"), exist_ok=True)

    def _http(self, url):
        for i in range(4):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=30) as r:
                    return json.loads(r.read().decode("utf-8"))
            except Exception as e:
                if i == 3:
                    raise
                print(f"retry {url}: {type(e).__name__}")
                time.sleep(2 * (i + 1))

    def get(self, path):
        self.calls += 1
        d = self._fetch(API + path)
        if self.pause:
            time.sleep(self.pause)
        return d

    def box(self, pk):
        path = os.path.join(self.cache, "box", f"{pk}.json")
        if os.path.exists(path):
            with open(path) as f:
                return json.load(f)
        d = self.get(f"game/{pk}/boxscore")
        slim = {side: {"team": (d.get("teams", {}).get(side) or {}).get("team", {}),
                       "players": {k: {"person": v.get("person", {}), "stats": v.get("stats", {})}
                                   for k, v in ((d.get("teams", {}).get(side) or {}).get("players") or {}).items()}}
                for side in ("home", "away")}
        with open(path, "w") as f:
            json.dump(slim, f)
        return slim


def teams_of(api, y):
    d = api.get(f"teams?sportId=1&season={y}")
    return {str(t["id"]): {"code": code(t.get("abbreviation")), "name": t.get("name") or t.get("teamName")}
            for t in d.get("teams") or [] if t.get("id")}


def schedule(api, y):
    """Season y's finished games: [{pk, date, home, away (team ids), hs, as, type}], oldest first."""
    d = api.get(f"schedule?sportId=1&season={y}&gameType=R,F,D,L,W")
    out = []
    for day in d.get("dates") or []:
        for g in day.get("games") or []:
            if (g.get("status") or {}).get("abstractGameState") != "Final" or g.get("gameType") not in TYPES:
                continue
            h, a = (g.get("teams") or {}).get("home") or {}, (g.get("teams") or {}).get("away") or {}
            if h.get("score") is None or a.get("score") is None:
                continue
            out.append({"pk": str(g["gamePk"]), "date": str(day.get("date")), "home": str(h["team"]["id"]),
                        "away": str(a["team"]["id"]), "hs": int(h["score"]), "as": int(a["score"]), "type": TYPES[g["gameType"]]})
    return sorted(out, key=lambda g: (g["date"], g["pk"]))


def team_stats(api, y):
    """{team id: {group: stat dict}} for hitting and pitching, regular season."""
    out = {}
    for grp in ("hitting", "pitching"):
        d = api.get(f"teams/stats?season={y}&sportIds=1&group={grp}&stats=season&gameType=R")
        for st in d.get("stats") or []:
            for sp in st.get("splits") or []:
                out.setdefault(str((sp.get("team") or {}).get("id")), {})[grp] = sp.get("stat") or {}
    return out


def player_stats(api, y):
    """{player id: {team, name, pos, hitting, pitching}} season totals, regular season."""
    out = {}
    for grp in ("hitting", "pitching"):
        d = api.get(f"stats?stats=season&group={grp}&season={y}&sportIds=1&gameType=R&playerPool=ALL&limit=5000")
        for st in d.get("stats") or []:
            for sp in st.get("splits") or []:
                pl = sp.get("player") or {}
                if not pl.get("id"):
                    continue
                p = out.setdefault(str(pl["id"]), {"name": pl.get("fullName") or "", "team": str((sp.get("team") or {}).get("id")),
                                                   "pos": str((sp.get("position") or {}).get("abbreviation") or "")})
                p[grp] = sp.get("stat") or {}
    return out


def team_season(games, tid, ts):
    reg = [g for g in games if g["type"] == "R" and tid in (g["home"], g["away"])]
    rows = [(g, g["hs"], g["as"], "H") if g["home"] == tid else (g, g["as"], g["hs"], "A") for g in reg]
    n = len(rows)
    if not n:
        return None
    res = ["W" if f > a else "L" for _, f, a, _ in rows]
    w, l, l10, streak = S.record(res)

    def rec(rs):
        return f"{sum(1 for _, f, a, _ in rs if f > a)}-{sum(1 for _, f, a, _ in rs if f < a)}"
    hit, pit = (ts or {}).get("hitting") or {}, (ts or {}).get("pitching") or {}
    outs = ip_outs(pit.get("inningsPitched"))
    return {"gp": n, "w": w, "l": l, "record": f"{w}-{l}", "last10": l10, "streak": streak,
            "home": rec([r for r in rows if r[3] == "H"]), "away": rec([r for r in rows if r[3] == "A"]),
            "rpg": S.r1(sum(f for _, f, _, _ in rows) / n, 2), "rapg": S.r1(sum(a for _, _, a, _ in rows) / n, 2),
            "margin": S.r1(sum(f - a for _, f, a, _ in rows) / n, 2),
            "avg": hit.get("avg"), "obp": hit.get("obp"), "slg": hit.get("slg"), "ops": hit.get("ops"),
            "hrpg": S.r1(num(hit.get("homeRuns")) / n, 2), "era": pit.get("era"), "whip": pit.get("whip"),
            "k9": S.r1(27 * num(pit.get("strikeOuts")) / outs, 1) if outs else None}


RATES = ["avg", "obp", "slg", "ops", "era", "whip"]           # shown as MLB writes them (".265"), ranked as numbers


def rank_rows():
    """team_rows for ranking: the rate rows too (they have no decimals, which is how league_ranks skips text rows)."""
    return [r if len(r) >= 3 or r[1] not in RATES else r + [None] for r in CONFIG["team_rows"]]


def rank_values(ts):
    """league_ranks needs numbers: the rate stats ('.281', '3.85') as floats, for ranking only."""
    return {t: {k: (num(v) if isinstance(v, str) else v) for k, v in s.items()} for t, s in ts.items() if s}


def season_line(p, y):
    hit, pit = p.get("hitting"), p.get("pitching")
    if pit and (not hit or num(pit.get("gamesPitched")) >= num((hit or {}).get("gamesPlayed")) / 2):
        gp, gs = int(num(pit.get("gamesPitched"))), int(num(pit.get("gamesStarted")))
        return "SP" if gs >= max(1, gp / 2) else "RP", {
            "gp": gp, "gs": gs, "w": int(num(pit.get("wins"))), "l": int(num(pit.get("losses"))), "sv": int(num(pit.get("saves"))),
            "ip": pit.get("inningsPitched"), "k": int(num(pit.get("strikeOuts"))), "bb": int(num(pit.get("baseOnBalls"))),
            "era": pit.get("era"), "whip": pit.get("whip")}
    if not hit:
        return None, None
    return POS_GROUP.get(p.get("pos"), "DH") if p.get("pos") != "P" else "DH", {
        "gp": int(num(hit.get("gamesPlayed"))), "ab": int(num(hit.get("atBats"))), "h": int(num(hit.get("hits"))),
        "hr": int(num(hit.get("homeRuns"))), "rbi": int(num(hit.get("rbi"))), "r": int(num(hit.get("runs"))),
        "bb": int(num(hit.get("baseOnBalls"))), "so": int(num(hit.get("strikeOuts"))), "avg": hit.get("avg"),
        "obp": hit.get("obp"), "slg": hit.get("slg"), "ops": hit.get("ops")}


def box_lines(box):
    """{player id: [team id, log values]} from one game's box score."""
    out = {}
    for side in ("home", "away"):
        t = box.get(side) or {}
        tid = str((t.get("team") or {}).get("id"))
        for v in (t.get("players") or {}).values():
            pid = str((v.get("person") or {}).get("id"))
            b, p = (v.get("stats") or {}).get("batting") or {}, (v.get("stats") or {}).get("pitching") or {}
            if not b and not p:
                continue
            h, d2, d3, hr = num(b.get("hits")), num(b.get("doubles")), num(b.get("triples")), num(b.get("homeRuns"))
            vals = {"ab": num(b.get("atBats")), "h": h, "hr": hr, "rbi": num(b.get("rbi")), "r": num(b.get("runs")),
                    "bb": num(b.get("baseOnBalls")), "so": num(b.get("strikeOuts")), "tb": h + d2 + 2 * d3 + 3 * hr,
                    "ip": float(ip_text(ip_outs(p.get("inningsPitched")))) if p else 0, "outs": ip_outs(p.get("inningsPitched")) if p else 0,
                    "k": num(p.get("strikeOuts")),
                    "er": num(p.get("earnedRuns")), "ha": num(p.get("hits"))}
            if b and not num(b.get("plateAppearances") or b.get("atBats") or b.get("baseOnBalls")) and not p:
                continue                              # in the lineup card but never came up
            out[pid] = [tid, vals]
    return out


def build(now, cache, fetch=None, pause=0.2):
    y = season_of(now)
    api = Api(cache, fetch, pause)
    teams = teams_of(api, y)
    games = {s: schedule(api, s) for s in (y, y - 1)}
    tstats = {s: team_stats(api, s) for s in (y, y - 1)}
    pstats = {s: player_stats(api, s) for s in (y, y - 1)}
    ts = {s: {t: team_season(games[s], t, tstats[s].get(t)) for t in teams} for s in (y, y - 1)}
    ratings, gp = {}, {}
    for s in (y, y - 1):
        reg = [g for g in games[s] if g["type"] == "R"]
        ratings[s], _ = S.srs([(g["home"], g["away"], g["hs"] - g["as"]) for g in reg], sorted(teams))
    gp = {t: (ts[y][t] or {}).get("gp", 0) for t in teams}
    rating = {t: S.blend(ratings[y].get(t, 0.0), ratings[y - 1].get(t, 0.0), gp[t]) for t in teams}
    order = sorted(teams, key=lambda t: -rating[t])
    rank = {t: i + 1 for i, t in enumerate(order)}
    ranks = S.league_ranks(rank_values(ts[y]), rank_rows(), CONFIG["rank_low"], CONFIG["rank_skip"])

    # logs: each team's last LOG_GAMES finished games this season (else last season's), box scores cached
    logs = {}
    for t in teams:
        mine = [g for g in (games[y] or games[y - 1]) if t in (g["home"], g["away"])][-LOG_GAMES:]
        for g in mine:
            opp, ha = (g["away"], "H") if g["home"] == t else (g["home"], "A")
            for pid, (tid, vals) in box_lines(api.box(g["pk"])).items():
                if tid == t:
                    season = int(g["date"][:4])
                    logs.setdefault(pid, []).append([g["date"], teams.get(opp, {}).get("code", ""), ha]
                                                    + [round(vals[k], 1) if k == "ip" else int(vals[k]) for k in LOG] + [g["type"], season])
    stamp = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    search, roster = [], {t: [] for t in teams}
    for pid in set(pstats[y]) | set(pstats[y - 1]):
        cur, prev = pstats[y].get(pid), pstats[y - 1].get(pid)
        latest = cur or prev
        grp, this = season_line(cur, y) if cur else (None, None)
        g2, last = season_line(prev, y - 1) if prev else (None, None)
        grp = grp or g2
        tid = latest.get("team")
        if not grp or tid not in teams:
            continue
        pl = {"id": pid, "name": latest["name"], "pos": latest.get("pos") or grp, "grp": grp, "this": this, "last": last,
              "log": sorted(logs.get(pid, []), key=lambda r: r[0], reverse=True)}
        if this or gp[tid] < 10:
            roster[tid].append(pl)
        s = this or last or {}
        search.append([pid, pl["name"], teams[tid]["code"], pl["pos"], s.get("gp"), s.get("hr"), s.get("rbi"), s.get("k"), y if this else y - 1])
    order_grp = {g: i for i, g in enumerate(HITTERS + PITCHERS)}

    def depth(pl):
        s = pl["this"] or pl["last"] or {}
        return -(ip_outs(s.get("ip")) if pl["grp"] in PITCHERS else s.get("ab", 0))
    for t in teams:
        roster[t].sort(key=lambda pl: (order_grp.get(pl["grp"], 9), depth(pl)))
        S.write(os.path.join(OUT, f"team_{teams[t]['code']}.json"), {
            "generated_at": stamp, "code": teams[t]["code"], "name": teams[t]["name"], "rank": rank[t], "rating": S.r1(rating[t], 2),
            "season": str(y), "last_season": str(y - 1), "season_year": y,
            "this": ts[y][t], "last": ts[y - 1][t], "ranks": ranks.get(t) or None,
            "games": [[g["date"], teams.get(g["away"] if g["home"] == t else g["home"], {}).get("code", ""), "H" if g["home"] == t else "A",
                       g["hs"] if g["home"] == t else g["as"], g["as"] if g["home"] == t else g["hs"],
                       "W" if (g["hs"] > g["as"]) == (g["home"] == t) else "L", g["type"], int(g["date"][:4]), ""]
                      for s in (y - 1, y) for g in games[s] if t in (g["home"], g["away"])][::-1],
            "players": roster[t]})
    search.sort(key=lambda r: -max(r[5] or 0, r[7] or 0))
    teams_out = []
    for t in order:
        s = ts[y][t] or {}
        teams_out.append({"code": teams[t]["code"], "name": teams[t]["name"], "rank": rank[t], "rating": S.r1(rating[t], 2),
                          "rating_this": S.r1(ratings[y].get(t), 2) if gp[t] else None, "rating_last": S.r1(ratings[y - 1].get(t), 2),
                          "last10": s.get("last10"), **{f: s.get(f) for f in ("gp", "w", "l", "record", "streak", "rpg", "rapg", "margin")}})
    S.write(os.path.join(OUT, "index.json"), {
        "generated_at": stamp, "sport": "MLB", "season": str(y), "last_season": str(y - 1), "season_year": y, "rank_last": "Last 10",
        "rating_note": (f"Runs per game better than an average team, adjusted for who each team played (SRS). Early in the "
                        f"season last season's rating counts as {S.PRIOR_GAMES} games, pulled {round((1 - S.CARRY) * 100)}% toward average."),
        "source": "MLB Stats API (statsapi.mlb.com). Unofficial use; regular season and postseason.",
        "log_cols": ["date", "opp", "ha"] + LOG + ["type", "season"], **CONFIG,
        "teams": teams_out, "players": search})
    return {"teams": len(teams), "games": len(games[y]), "players": len(search), "calls": api.calls}


def main():
    cache = os.getenv("MLB_STATS_CACHE") or tempfile.mkdtemp()
    out = build(datetime.now(timezone.utc), cache)
    print(f"MLB research files: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
