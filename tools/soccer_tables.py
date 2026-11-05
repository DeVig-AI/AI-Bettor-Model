#!/usr/bin/env python3
"""
soccer_tables.py -- each soccer league's table (ESPN's standings) and every team's results this season in that
competition (ESPN's team schedules): the start of the soccer database (rankings, team profiles, past games).
Display only: nothing here feeds a model, a pick or a test.

The table is the league's own ranking: points, then the league's tie-breakers, as ESPN publishes it, with the zone notes
ESPN carries (Champions League places, relegation, playoffs). MLS comes as two conferences; the European cups as their
league phase. Form = the last five results in that competition, newest last.

Output: live/soccer_tables.json
  {generated_at, leagues: {code: {name, season, groups: [{name, rows: [{rank, id, code, name, color, gp, w, d, l, gf, ga,
   gd, pts, zone: {label, color} | null, form: "WDLWW"}]}]}},
   teams: {"<code>|<espn id>": {id, code, name, league, games: [[date, opp code, "H"|"A", goals for, goals against]]}},
   errors: [...]}
Keyless: ESPN public endpoints only.
"""
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
import soccer_lines as SL  # noqa: E402

KG = SL.KG
OUT = os.path.join(os.path.dirname(__file__), "..", "live", "soccer_tables.json")
STANDINGS = "https://site.api.espn.com/apis/v2/sports/soccer/"


def stat(entry, name):
    for s in entry.get("stats") or []:
        if s.get("name") == name:
            v = s.get("value")
            if v is None:
                v = KG.fnum(str(s.get("displayValue") or "").replace("+", ""))
            return int(v) if v is not None else None
    return None


def table(d):
    """ESPN standings -> (season name, [{name, rows}])."""
    groups, season = [], None
    kids = d.get("children") or ([{"name": d.get("name"), "standings": d.get("standings")}] if d.get("standings") else [])
    for c in kids:
        st = c.get("standings") or {}
        season = season or st.get("seasonDisplayName")
        rows = []
        for e in st.get("entries") or []:
            t = e.get("team") or {}
            note = e.get("note") or {}
            rows.append({
                "rank": stat(e, "rank") or note.get("rank"), "id": str(t.get("id") or ""),
                "code": str(t.get("abbreviation") or "").upper(),
                "name": t.get("shortDisplayName") or t.get("displayName") or "",
                "color": None,
                "gp": stat(e, "gamesPlayed"), "w": stat(e, "wins"), "d": stat(e, "ties"), "l": stat(e, "losses"),
                "gf": stat(e, "pointsFor"), "ga": stat(e, "pointsAgainst"), "gd": stat(e, "pointDifferential"),
                "pts": stat(e, "points"),
                "zone": {"label": note["description"], "color": note.get("color")} if note.get("description") else None,
            })
        rows.sort(key=lambda r: (r["rank"] is None, r["rank"] or 0))
        for i, r in enumerate(rows):                  # ESPN leaves rank out for some groups: use the order it gives
            r["rank"] = r["rank"] or i + 1
        groups.append({"name": c.get("name") or "", "rows": rows})
    return season, groups


def score(c):
    s = c.get("score")
    if isinstance(s, dict):
        s = s.get("value", s.get("displayValue"))
    return KG.fnum(s)


def results(slug, team_id):
    """A team's finished games this season in one competition, oldest first: (games, colour)."""
    d = KG.get(SL.ESPN_SITE + slug + f"/teams/{team_id}/schedule") or {}
    color = (d.get("team") or {}).get("color")
    out = []
    for ev in d.get("events") or []:
        comp = (ev.get("competitions") or [{}])[0]
        st = ((comp.get("status") or ev.get("status") or {}).get("type")) or {}
        if st.get("state") != "post":
            continue
        side = {c.get("homeAway"): c for c in comp.get("competitors") or []}
        me = next((k for k, c in side.items() if str((c.get("team") or {}).get("id")) == str(team_id)), None)
        if me not in ("home", "away") or len(side) != 2:
            continue
        opp = side["away" if me == "home" else "home"]
        gf, ga = score(side[me]), score(opp)
        if gf is None or ga is None:
            continue
        out.append([str(ev.get("date") or "")[:10], str((opp.get("team") or {}).get("abbreviation") or "").upper(),
                    "H" if me == "home" else "A", int(gf), int(ga)])
    out.sort(key=lambda g: g[0])
    return out, ("#" + color) if color else None


def form(games, n=5):
    return "".join("W" if g[3] > g[4] else "L" if g[3] < g[4] else "D" for g in games[-n:])


def league(code):
    _, slug, label = SL.LEAGUES[code]
    d = KG.get(STANDINGS + slug + "/standings") or {}
    season, groups = table(d)
    rows = [r for g in groups for r in g["rows"] if r["id"]]
    with ThreadPoolExecutor(max_workers=6) as ex:
        got = list(ex.map(lambda r: results(slug, r["id"]), rows))
    teams = {}
    for r, (games, color) in zip(rows, got):
        r["color"], r["form"] = color, form(games)
        teams[f"{code}|{r['id']}"] = {"id": r["id"], "code": r["code"], "name": r["name"], "league": code, "games": games}
    return {"name": label, "season": season, "groups": groups}, teams


def main():
    leagues, teams = {}, {}
    for code in SL.LEAGUES:
        try:
            lg, tm = league(code)
            if lg["groups"]:
                leagues[code] = lg
                teams.update(tm)
            else:
                KG.log.append(f"{code}: no table")
        except Exception as e:                        # one league failing must not drop the others
            KG.log.append(f"{code}: {type(e).__name__}: {e}")
    out = {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "leagues": leagues,
           "teams": teams, "errors": KG.log[:20]}
    if not leagues:
        print("no soccer tables; keeping the old file")
        return 1
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"{len(leagues)} soccer tables, {len(teams)} teams, {sum(len(t['games']) for t in teams.values())} results")
    return 0


if __name__ == "__main__":
    sys.exit(main())
