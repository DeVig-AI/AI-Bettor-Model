#!/usr/bin/env python3
"""
soccer_futures.py -- Kalshi's season markets for each soccer league the app shows: who wins it, top finishes, who goes
down, who finishes last, the Golden Boot and other player awards, players' season goals and the champion's winning
margin. Teams are matched to ESPN's ids through live/soccer_tables.json (run tools/soccer_tables.py first), so the
tables and team pages can show them. Display only: nothing here feeds a model, a pick or a test.

Output: live/soccer_futures.json
  {generated_at, leagues: {code: [{key, label, who: team|player|range, rows: [[espn id | null, name, bid, ask, ticker]]
   (player season goals: [[null, name, n, bid, ask, ticker]], "n or more")}]}, errors: [...]}
  bid / ask = Kalshi's best prices for yes now, in dollars (None when nobody's quoting). The app shows their middle,
  and leaves out a market whose bid and ask are far apart (too thin to say much).
Keyless: Kalshi's public endpoints only.
"""
import json
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kalshi_games_v1 as KG  # noqa: E402
import soccer_lines as SL  # noqa: E402

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "..", "live", "soccer_futures.json")
TABLES = os.path.join(HERE, "..", "live", "soccer_tables.json")
# app code -> (Kalshi's name in its season series, its title-winner series)
KAL = {
    "EPL": ("EPL", "KXPREMIERLEAGUE"), "LALIGA": ("LALIGA", "KXLALIGA"), "SERIEA": ("SERIEA", "KXSERIEA"),
    "BUND": ("BUNDESLIGA", "KXBUNDESLIGA"), "LIGUE1": ("LIGUE1", "KXLIGUE1"), "UCL": ("UCL", "KXUCL"),
    "UEL": ("UEL", "KXUEL"), "UECL": ("UECL", "KXUECL"), "MLS": ("MLS", "KXMLSCUP"), "LIGAMX": ("LIGAMX", "KXLIGAMX"),
}
# the other season series, tried for every league (one call each; a league Kalshi doesn't run one for has none)
OTHER = ("TOP", "RELEGATION", "LAST", "EAST", "WEST", "LEADER", "SEASONSTAT", "POINTMARGIN")
ORDER = ["title", "apertura", "clausura", "east", "west", "top", "top2", "top4", "top6", "top8", "tophalf",
         "relegation", "last", "goal", "ast", "seasongoal", "margin"]


def label_of(code, kind, ev):
    """(key, label, who) for one season event, from its series and the end of its ticker (KXEPLTOP-27TOP4 -> TOP4)."""
    tail = str(ev.get("event_ticker") or "").split("-", 1)[-1]
    sub = str(ev.get("sub_title") or "")
    if kind == "TITLE":
        if code == "LIGAMX":
            k = "apertura" if "APER" in tail else "clausura" if "CLA" in tail else "title"
            return k, f"Wins the {k.title()}" if k != "title" else "Wins it", "team"
        return "title", {"UCL": "Wins the Champions League", "UEL": "Wins the Europa League",
                         "UECL": "Wins the Conference League", "MLS": "Wins MLS Cup"}.get(code, "Wins the league"), "team"
    if kind == "TOP":
        m = re.search(r"TOP(\d+|HALF)$", tail)
        if not m:
            return "top", "Tops the league phase" if code == "UCL" else "Finishes top", "team"
        n = m.group(1)
        return f"top{n.lower()}", "Top half" if n == "HALF" else f"Top {n}", "team"
    if kind == "RELEGATION":
        return "relegation", "Relegated", "team"
    if kind == "LAST":
        return "last", "Finishes last", "team"
    if kind in ("EAST", "WEST"):
        return kind.lower(), f"Wins the {kind.title()}", "team"
    if kind == "LEADER":
        if tail.endswith("AST"):
            return "ast", "Most assists", "player"
        return "goal", "Top scorer", "player"
    if kind == "SEASONSTAT" and tail.endswith("GOAL"):
        return "seasongoal", "Season goals", "player"
    if kind == "POINTMARGIN":
        return "margin", "Champion's points margin", "range"
    return None


def team_id(name, code, teams):
    """ESPN's id for Kalshi's team in this league, or None: the same code (Kalshi's ticker ends in it, ESPN's tables
    keep theirs), else the same name, else the only name that one's words fit into ("San Luis" / "Atl. San Luis")."""
    for pick in (lambda t: t.get("code") == code,
                 lambda t: SL.words(name) == SL.words(t["name"]),
                 lambda t: SL.same_team(name, [t["name"]])):
        hits = [t for t in teams if pick(t)]
        if len(hits) == 1:
            return hits[0]["id"]
    return None


def market(code, kind, ev, teams):
    lab = label_of(code, kind, ev)
    if not lab:
        return None
    key, label, who = lab
    rows = []
    for m in ev.get("markets") or []:
        if m.get("status") not in (None, "active", "open"):
            continue
        q = KG._quote(m)
        sub = str(m.get("yes_sub_title") or "").strip()
        if key == "seasongoal":
            mm = re.match(r"^(.*?):\s*(\d+)\+?$", sub)
            if mm:
                rows.append([None, mm.group(1).strip(), int(mm.group(2)), q["bid"], q["ask"], q["ticker"]])
            continue
        rid = team_id(sub, str(q["ticker"] or "").rsplit("-", 1)[-1], teams) if who == "team" else None
        rows.append([rid, SL.player_name(sub) if who == "player" else sub, q["bid"], q["ask"], q["ticker"]])
    if not rows:
        return None
    if key == "seasongoal":
        rows.sort(key=lambda r: (r[1], r[2]))
    elif key != "margin":
        rows.sort(key=lambda r: -(((r[2] or 0) + (r[3] or 0)) / 2))
    return {"key": key, "label": label, "who": who, "rows": rows}


def league(code, tables):
    name, title = KAL[code]
    teams = [t for t in (tables.get("teams") or {}).values() if t.get("league") == code]
    out = []
    for kind, series in [("TITLE", title)] + [(k, f"KX{name}{k}") for k in OTHER]:
        if kind in ("EAST", "WEST") and code != "MLS":
            continue
        try:
            evs = KG._events(series)
        except Exception as e:                        # one series failing must not drop the rest
            KG.log.append(f"{series}: {type(e).__name__}: {e}")
            continue
        for ev in evs:
            mk = market(code, kind, ev, teams)
            if mk:
                out.append(mk)
    out.sort(key=lambda m: ORDER.index(m["key"]) if m["key"] in ORDER else len(ORDER))
    return out


def main():
    now = datetime.now(timezone.utc)
    try:
        with open(TABLES) as f:
            tables = json.load(f)
    except (OSError, ValueError):
        tables = {}
        KG.log.append("no soccer_tables.json: teams aren't matched to ESPN's ids")
    leagues = {}
    for code in KAL:
        try:
            leagues[code] = league(code, tables)
        except Exception as e:                        # one league failing must not drop the others
            KG.log.append(f"{code}: {type(e).__name__}: {e}")
    if not any(leagues.values()):
        print("Kalshi gave no soccer season markets; keeping the old file")
        return 0
    out = {"generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "leagues": leagues, "errors": KG.log[:20]}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(", ".join(f"{k} {len(v)}" for k, v in leagues.items()), "season markets")
    return 0


if __name__ == "__main__":
    sys.exit(main())
