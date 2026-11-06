#!/usr/bin/env python3
"""
injuries_export.py -- the app's Injuries tab (nba/, nfl/, nhl/, stats/soccer/, stats/cfb/ and stats/cbb/ injuries_export.json,
stats/soccer/injuries_leagues_export.json), refreshed by a bot
(injuries.yml) instead of by hand, with a "game changer" scale on every player: how much his team loses if he sits.
INFORMATION ONLY: no pick, tier or lock reads these files.

Sources (public, no key):
  NBA  the league's official injury report (the latest PDF at ak-static.cms.nba.com, published every 15 minutes on
       game days) for status and reason; stats/nba/team_<code>.json for minutes and points.
  NFL  ESPN's injury feed and nflverse snap counts, read with nfl/injury_report_nfl_v2.py's own functions; this
       week's games from nflverse; stats/nfl/team_<code>.json for targets and carries.

Game changer scale (four levels; the reason is shown next to it):
  NBA  the player's share of his team: the average of his share of its minutes (minutes a game / 240) and of its
       points (points a game / the team's points a game), this season once he has played 3 games, else last season.
       Game changer >= 15% (about the top 3% of players: the stars), Big >= 11%, Some >= 7%, else Minor.
  NFL  DeVig's own injury study (research/injuries/results_v1.md, 2013-2018 games): losing last game's starting QB
       cost about 3.8 points of final margin; any other regular (50%+ of snaps) about 0.5 points; so a starting QB
       (50%+ of snaps) is a Game changer, any other regular is Some, everyone else Minor. Big is not used for the NFL:
       the study found no single non-QB position worth more than a regular's half point. Skill players' share of
       their team's targets and carries is shown as context.
  NHL  ESPN's injury feed; this season's skater stats (stats/nhl) for the player's share of his team's points and his
       ice time. This is a role measure, not a measured effect on the result: Big >= 12% of the team's points (about
       a top-two scorer), Some >= 6% or 18+ minutes a night, else Minor. A goalie is Some (DeVig has no goalie stats, so
       starter or backup isn't told apart). Day-to-day and out players are listed; injured reserve only for regulars.
  EPL  the Premier League's own Fantasy Premier League data (status, chance of playing, news) for the next round's
       matches. Role measure again: a regular starts 60%+ of his team's matches; Big = a regular in 25%+ of the
       team's goals (goals + assists), Some = any other regular, else Minor. Players gone on loan or transfer are left
       out.
  Other soccer leagues (La Liga, Serie A, Bundesliga, Ligue 1, the UEFA cups, MLS, Liga MX): FotMob's match pages
       (each club's unavailable players, injury or suspension, expected return) for the board's matches in the next
       three days (live/soccer_lines.json). Role measure from stats/soccer (ESPN box scores): a regular played in 6+ of
       the club's last 10 matches; Big = a regular in 25%+ of its goals, Some = any other regular, else Minor.
  CFB, CBB  Covers.com's injury pages for the board's games in the next three days (live/game_lines.json). A
       Questionable or Probable not updated in 21 days is dropped; Out is kept. CFB role measure from stats/cfb (this
       season): the team's main passer is Big; 25%+ of the team's rushing and receiving yards Big, 10%+ Some; 6%+ of
       its tackles Some; else Minor. CBB has no player stats in DeVig yet, so no scale (status and reason only).
The scale is how much is lost IF he misses the game; his status (Out / Questionable / ...) is separate.

A status that changed since the previous run gets a note ("Downgraded from Questionable"). If a source can't be
read, that sport's previous file is left unchanged.

Usage:  python3 tools/injuries_export.py [--sport NBA|NFL|NHL|EPL|SOCCER|CFB|CBB] [--now ISO]
"""
import argparse
import io
from html import unescape as html_unescape
import json
import re
import sys
import unicodedata
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "nfl"))
sys.path.insert(0, str(ROOT / "nba"))
import injury_report_nfl_v2 as NFLI  # noqa: E402  (its ESPN fetch, snap shares and team codes, read-only use)
from export_lineboard_nba import CODE as NBA_CODE  # noqa: E402

ET = ZoneInfo("America/New_York")
OUT = {"NBA": ROOT / "nba" / "injuries_export.json", "NFL": ROOT / "nfl" / "injuries_export.json",
       "NHL": ROOT / "nhl" / "injuries_export.json", "EPL": ROOT / "stats" / "soccer" / "injuries_export.json",   # app data, not the Lab's
       "SOCCER": ROOT / "stats" / "soccer" / "injuries_leagues_export.json",
       "CFB": ROOT / "stats" / "cfb" / "injuries_export.json", "CBB": ROOT / "stats" / "cbb" / "injuries_export.json"}
STATS = ROOT / "stats"
NBA_REPORT = "https://ak-static.cms.nba.com/referee/injury/Injury-Report_{date}_{time}.pdf"

LEVELS = {"gamechanger": ("Game changer", 4), "big": ("Big", 3), "some": ("Some", 2), "minor": ("Minor", 1)}
NBA_CUTS = ((0.15, "gamechanger"), (0.11, "big"), (0.07, "some"))
NFL_QB_POINTS, NFL_REGULAR_POINTS, NFL_REGULAR_SHARE = 3.8, 0.5, 0.50     # research/injuries/results_v1.md
NFL_STARTER_SHARE = 0.60                                                   # the page's "starter" (60%+ of snaps)
STATUS_RANK = {"Out": 0, "Doubtful": 1, "Questionable": 2, "Day-To-Day": 2, "Probable": 3, "Available": 4}
NFL_DESIGNATIONS = {"Out", "Doubtful", "Questionable"}


def impact(level, why):
    label, bars = LEVELS[level]
    return {"level": level, "label": label, "bars": bars, "why": why}


def norm(name):
    s = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode()
    return NFLI.norm(s)


def slug(*parts):
    return "-".join(re.sub(r"[^a-z0-9]+", "-", norm(p) if i else p.lower()).strip("-") for i, p in enumerate(parts))


def fetch(url, timeout=30):
    req = urllib.request.Request(url, headers=NFLI.BROWSER_HEADERS)
    with urllib.request.urlopen(req, timeout=timeout, context=NFLI.CTX) as r:
        return r.read()


def team_stats(sport, code):
    f = STATS / sport.lower() / f"team_{code}.json"
    return json.loads(f.read_text()) if f.exists() else None


def previous(sport):
    """{(team, player): row} from this sport's last export, for status-change notes."""
    try:
        d = json.loads(OUT[sport].read_text())
    except (OSError, ValueError):
        return {}
    return {(x["data"]["team"], x["data"]["player"]): x["data"] for x in d.get("docs", []) if x.get("collection") == "injuries"}


def change_note(row, prev):
    p = prev.get((row["team"], row["player"]))
    if not p or (p.get("away"), p.get("home")) != (row["away"], row["home"]):
        return None
    if p.get("status") != row["status"]:
        if p.get("status") not in STATUS_RANK or row["status"] not in STATUS_RANK:
            return None                  # Out vs Injured Reserve / Suspension / PUP: not playing either way, no change
        worse = STATUS_RANK[row["status"]] < STATUS_RANK[p["status"]]
        return f"{'Downgraded' if worse else 'Upgraded'} from {p.get('status', '?').lower()}"
    note = p.get("note") or ""
    if row["status"] not in STATUS_RANK:
        return None                      # long-term lists (IR ...) never carry a change note
    return note if note.startswith(("Downgraded", "Upgraded")) else None    # only this bot's own notes carry over


def write(sport, meta, rows, source):
    docs = [{"collection": "injury_meta", "doc_id": f"{sport.lower()}-meta", "data": meta}]
    seen = set()
    for r in rows:
        i = slug(sport, r["team"], r["player"])
        if i in seen:
            continue
        seen.add(i)
        docs.append({"collection": "injuries", "doc_id": i, "data": r})
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    OUT[sport].parent.mkdir(parents=True, exist_ok=True)
    OUT[sport].write_text(json.dumps({"generated_at": now, "source": source, "docs": docs}, indent=1, sort_keys=True) + "\n")
    print(f"{sport}: {len(docs) - 1} players written to {OUT[sport].relative_to(ROOT)}")
    archive(sport, [d["data"] for d in docs[1:]], now)


# ================================================================ archive
# Every status change, kept so a future pre-registered test can ask whether injuries help a sport's model (the live
# file above only ever shows the latest). One line per change: a player newly listed, a new status, reason or game,
# or a player no longer listed ("Cleared"). Nothing reads this for a pick.
ARCHIVE = ROOT / "stats" / "injuries_archive"
ARCHIVE_KEYS = ("status", "reason", "away", "home", "tip", "tip_sort", "kickoff", "game")


def archive(sport, rows, now):
    d = ARCHIVE / sport.lower()
    d.mkdir(parents=True, exist_ok=True)
    last_f = d / "last.json"
    last = json.loads(last_f.read_text()) if last_f.exists() else {}
    cur, lines = {}, []
    for r in rows:
        k = slug(sport, r["team"], r["player"])
        state = {x: r[x] for x in ARCHIVE_KEYS if r.get(x) not in (None, "")}
        cur[k] = {"team": r["team"], "player": r["player"], **state}
        if last.get(k) != cur[k]:
            lines.append({"seen_at": now, **cur[k], "impact": (r.get("impact") or {}).get("level")})
    for k, v in last.items():
        if k not in cur:
            lines.append({"seen_at": now, "team": v["team"], "player": v["player"], "status": "Cleared"})
    if lines:
        with open(d / f"{now[:7]}.jsonl", "a") as f:
            for x in lines:
                f.write(json.dumps(x, sort_keys=True) + "\n")
    last_f.write_text(json.dumps(cur, indent=0, sort_keys=True) + "\n")
    print(f"{sport}: {len(lines)} status changes archived")


# ================================================================ NBA

def latest_report(now_et, hours_back=12):
    """(url, report time) of the newest official report at or before now (they come every 15 minutes)."""
    t = now_et.replace(minute=now_et.minute - now_et.minute % 15, second=0, microsecond=0)
    for _ in range(hours_back * 4):
        url = NBA_REPORT.format(date=t.strftime("%Y-%m-%d"), time=t.strftime("%I_%M%p"))
        try:
            return url, t, fetch(url)
        except Exception:
            t -= timedelta(minutes=15)
    raise OSError("no official NBA injury report in the last 12 hours")


def parse_report(pdf_bytes):
    """Rows of the official report: {date, time, matchup, team, player, status, reason}. Words are placed in columns
    by the column header's x positions (only page 1 has that header; the rest repeat just the title line). A reason
    that wraps onto lines of its own belongs to the nearest player line, except a line at the very top of a page,
    well above its first player: that is the end of the previous page's last reason."""
    import pdfplumber
    rows = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        cols = None
        cur = {"date": "", "time": "", "matchup": "", "team": ""}
        for page in pdf.pages:
            words = page.extract_words(x_tolerance=1.5)
            head = {w["text"]: w for w in words if w["text"] in ("Game", "Matchup", "Team", "Player", "Current", "Reason")}
            games = [w for w in words if w["text"] == "Game"]
            if len(games) >= 2 and all(k in head for k in ("Matchup", "Team", "Player", "Current", "Reason")):
                games.sort(key=lambda w: w["x0"])
                cols = [("date", games[0]["x0"]), ("time", games[1]["x0"]), ("matchup", head["Matchup"]["x0"]),
                        ("team", head["Team"]["x0"]), ("player", head["Player"]["x0"]),
                        ("status", head["Current"]["x0"]), ("reason", head["Reason"]["x0"])]
            if cols is None:
                continue
            title = [w["top"] for w in words if w["text"] == "Report:"]
            skip_above = max([head["Reason"]["top"] if "Reason" in head else 0] + [t for t in title]) + 2
            lines = {}
            for w in words:
                if w["top"] <= skip_above:
                    continue
                lines.setdefault(round(w["top"] / 3), []).append(w)
            lines = {k: v for k, v in lines.items()
                     if not re.fullmatch(r"Page \d+ of \d+", " ".join(w["text"] for w in sorted(v, key=lambda w: w["x0"])))}
            page_rows, orphans = [], []
            for key in sorted(lines):
                cells = {}
                for w in sorted(lines[key], key=lambda w: w["x0"]):
                    col = [c for c, x in cols if w["x0"] >= x - 3][-1]
                    cells.setdefault(col, []).append(w["text"])
                top = min(w["top"] for w in lines[key])
                text = {c: " ".join(v) for c, v in cells.items()}
                for c in ("date", "time", "matchup"):
                    if text.get(c):
                        cur[c] = text[c]
                if text.get("team"):
                    cur["team"] = text["team"]
                if text.get("player"):
                    r = dict(cur, player=text["player"], status=text.get("status", ""), reason_parts=[])
                    if text.get("reason"):
                        r["reason_parts"].append((top, text["reason"]))
                    r["top"] = top
                    page_rows.append(r)
                elif "SUBMITTED" in text.get("reason", ""):
                    rows.append(dict(cur, player=None, status="", reason="", not_submitted=True))
                elif text.get("reason"):
                    orphans.append((top, text["reason"]))
            first_top = min((r["top"] for r in page_rows), default=None)
            for top, txt in orphans:
                if rows and (first_top is None or top < first_top - 12):
                    rows[-1]["reason"] += " " + txt                     # carried over from the previous page
                elif page_rows:
                    min(page_rows, key=lambda r: abs(r["top"] - top))["reason_parts"].append((top, txt))
            for r in page_rows:
                r["reason"] = " ".join(t for _, t in sorted(r.pop("reason_parts")))
                r.pop("top")
                rows.append(r)
    return rows


def person(last_first):
    if "," not in last_first:
        return last_first.strip()
    last, first = last_first.split(",", 1)
    return f"{first.strip()} {last.strip()}"


def clean_reason(reason):
    r = re.sub(r"\s*-\s*", " - ", reason or "").strip()
    r = re.sub(r"^Injury/Illness\s*-\s*", "", r)
    r = re.sub(r"([a-z])([A-Z])", r"\1 \2", r)               # "LeftHamstringStrain" -> "Left Hamstring Strain"
    r = re.sub(r"\s*/\s*", "/", r).strip(" -/")
    return r[:1].upper() + r[1:] if r else ""


def nba_tip(time_txt):
    m = re.match(r"(\d{1,2}):(\d{2})", time_txt or "")
    if not m:
        return "", "9999"
    h, mi = int(m.group(1)), int(m.group(2))
    h24 = h + 12 if h < 12 else h                             # NBA tips are afternoon/evening ET
    return f"{h}:{mi:02d} PM", f"{h24:02d}{mi:02d}"


def nba_player_line(stats, name):
    """(share, minutes, points, team points, basis) for a player in his team's stats file, or None."""
    if not stats:
        return None
    team_ppg = (stats.get("this") or {}).get("ppg") if (stats.get("this") or {}).get("gp") else None
    team_ppg = team_ppg or (stats.get("last") or {}).get("ppg")
    for p in stats.get("players", []):
        if norm(p["name"]) != norm(name):
            continue
        th, la = p.get("this") or {}, p.get("last") or {}
        use, basis = (th, "this season") if (th.get("gp") or 0) >= 3 and th.get("min") is not None else (la, "last season")
        if use.get("min") is None or not team_ppg:
            return None
        share = (use["min"] / 240 + (use.get("pts") or 0) / team_ppg) / 2
        return share, use["min"], use.get("pts") or 0, team_ppg, basis
    return None


def nba_starters(stats):
    """The team's five players with the most minutes a game (this season once 3 games are played, else last)."""
    if not stats:
        return set()
    mins = []
    for p in stats.get("players", []):
        th, la = p.get("this") or {}, p.get("last") or {}
        use = th if (th.get("gp") or 0) >= 3 and th.get("min") is not None else la
        if use.get("min") is not None:
            mins.append((use["min"], norm(p["name"])))
    return {n for _, n in sorted(mins, reverse=True)[:5]}


def nba_impact(line, code):
    if line is None:
        return impact("minor", "Not in his team's rotation stats")
    share, mins, pts, team_ppg, basis = line
    level = next((lv for cut, lv in NBA_CUTS if share >= cut), "minor")
    return impact(level, f"{mins:.0f} min · {pts:.1f} pts a game = {pts / team_ppg:.0%} of {code}'s points"
                         + ("" if basis == "this season" else " (last season)"))


def run_nba(now):
    now_et = now.astimezone(ET)
    url, at, pdf = latest_report(now_et)
    raw = parse_report(pdf)
    today = now_et.strftime("%m/%d/%Y")
    prev = previous("NBA")
    stats_cache, rows, pending = {}, [], {}
    for r in raw:
        if not r["date"]:
            continue
        day = datetime.strptime(r["date"], "%m/%d/%Y")
        tip, tip_sort = nba_tip(r["time"])
        if tip_sort != "9999":
            start = day.replace(hour=int(tip_sort[:2]), minute=int(tip_sort[2:]), tzinfo=ET)
            if start < now_et - timedelta(hours=3):
                continue                                   # finished: tonight's games drop off 3 hours after tip
        elif day.date() < now_et.date():
            continue
        status = r["status"].strip()
        reason = clean_reason(r["reason"])
        if "@" not in r["matchup"]:
            continue
        away, home = r["matchup"].split("@", 1)
        code = NBA_CODE.get(r["team"]) or NBA_CODE.get(r["team"].replace("LA ", "Los Angeles "))
        if code not in (away, home):
            continue
        if r.get("not_submitted"):
            pending.setdefault(f"{away}@{home}", []).append(code)   # the page says so instead of showing "no injuries"
            continue
        if not status or status == "Available" or reason.lower().startswith("g league"):
            continue
        if code not in stats_cache:
            stats_cache[code] = team_stats("NBA", code)
        name = person(r["player"])
        row = {"sport": "NBA", "away": away, "home": home, "team": code, "player": name, "status": status,
               "reason": reason, "tip": tip if r["date"] == today else day.strftime("%a ") + tip,
               "tip_sort": day.strftime("%m%d") + tip_sort,
               "starter": norm(name) in nba_starters(stats_cache[code]),
               "impact": nba_impact(nba_player_line(stats_cache[code], name), code)}
        note = change_note(row, prev)
        if note:
            row["note"] = note
        rows.append(row)
    if not rows and not pending:
        print("NBA: the report has no players for today's games; keeping the previous file.")
        return
    label = at.strftime("%b %-d · %-I:%M %p ET report")
    write("NBA", {"sport": "NBA", "as_of": label, "date": now_et.strftime("%Y-%m-%d"), "report_url": url,
                  "not_submitted": pending}, rows,
          f"NBA official injury report ({url.rsplit('/', 1)[-1]}); game changer scale from stats/nba (tools/injuries_export.py)")


# ================================================================ NHL

ESPN = "https://site.api.espn.com/apis/site/v2/sports/"
NHL_ALIAS = {"UTAH": "UTA"}                                    # ESPN code -> the stats files' code
NHL_CUTS = ((0.12, "big"), (0.06, "some"))
NHL_REGULAR_TOI = 18.0


def fetch_json(url):
    return json.loads(fetch(url))


def upcoming(path, now, days=2):
    """{team code: game} for each team's next game in the next `days` days (ESPN scoreboard), not yet finished."""
    out = {}
    for d in range(days + 1):
        day = (now.astimezone(ET) + timedelta(days=d)).strftime("%Y%m%d")
        for e in fetch_json(f"{ESPN}{path}/scoreboard?dates={day}").get("events") or []:
            c = e["competitions"][0]
            if c["status"]["type"]["state"] == "post":
                continue
            side = {x["homeAway"]: NHL_ALIAS.get(x["team"]["abbreviation"], x["team"]["abbreviation"]) for x in c["competitors"]}
            g = {"away": side["away"], "home": side["home"], "kickoff": datetime.fromisoformat(e["date"].replace("Z", "+00:00"))}
            for t in side.values():
                out.setdefault(t, g)
    return out


def nhl_player(stats, name):
    """(share of the team's points this season, ice time a game) or None."""
    if not stats:
        return None
    ps = stats.get("players", [])
    total = sum((p.get("this") or {}).get("p_tot") or 0 for p in ps)
    for p in ps:
        if norm(p["name"]) == norm(name):
            th = p.get("this") or {}
            if not th.get("gp"):
                return None
            return ((th.get("p_tot") or 0) / total if total else 0.0), th.get("toi") or 0.0, th.get("p_tot") or 0, th["gp"]
    return None


def nhl_impact(pos, line, code):
    if pos == "G":
        return impact("some", "Goalie (DeVig has no goalie stats, so starter or backup isn't told apart)")
    if line is None:
        return impact("minor", "No games for him in this season's stats")
    share, toi, pts, gp = line
    level = next((lv for cut, lv in NHL_CUTS if share >= cut), "some" if toi >= NHL_REGULAR_TOI else "minor")
    return impact(level, f"{toi:.0f} min a game · {pts} point{'' if pts == 1 else 's'} in {gp} games = {share:.0%} of {code}'s points")


def nhl_reason(inj, pos):
    m = re.search(r"\(([^)]+)\)", inj.get("shortComment") or "")
    return " · ".join(x for x in (pos, m.group(1).capitalize() if m else "") if x)


def run_nhl(now):
    games = upcoming("hockey/nhl", now)
    if not games:
        print("NHL: no games in the next two days; keeping the previous file.")
        return
    feed = fetch_json(f"{ESPN}hockey/nhl/injuries")
    prev = previous("NHL")
    rows, cache = [], {}
    for t in feed.get("injuries") or []:
        for inj in t.get("injuries") or []:
            ath = inj.get("athlete") or {}
            code = NHL_ALIAS.get((ath.get("team") or {}).get("abbreviation"), (ath.get("team") or {}).get("abbreviation"))
            g = games.get(code)
            status = (inj.get("status") or "").strip()
            if not g or not status or status.lower() == "active":
                continue
            if code not in cache:
                cache[code] = team_stats("NHL", code)
            name = ath.get("displayName") or ""
            pos = ((ath.get("position") or {}).get("abbreviation") or "").upper()
            line = nhl_player(cache[code], name)
            imp = nhl_impact(pos, line, code)
            regular = pos == "G" or imp["level"] != "minor"
            if "reserve" in status.lower() and not regular:
                continue                                       # long-term lists only for regulars, as for the NFL
            kick = g["kickoff"].astimezone(ET)
            row = {"sport": "NHL", "away": g["away"], "home": g["home"], "team": code, "player": name, "status": status,
                   "reason": nhl_reason(inj, pos), "tip": kick.strftime("%a %-I:%M %p"), "tip_sort": kick.strftime("%m%d-%H%M"),
                   "starter": regular, "impact": imp}
            note = change_note(row, prev)
            if note:
                row["note"] = note
            rows.append(row)
    if not rows:
        print("NHL: ESPN listed nobody for the next games' teams; keeping the previous file.")
        return
    now_et = now.astimezone(ET)
    write("NHL", {"sport": "NHL", "as_of": now_et.strftime("%a %b %-d · %-I:%M %p ET"), "date": now_et.strftime("%Y-%m-%d")},
          rows, "ESPN injury feed; role scale from stats/nhl (tools/injuries_export.py)")


# ================================================================ EPL (Fantasy Premier League)

FPL = "https://fantasy.premierleague.com/api/"
FPL_TO_ESPN = {"MCI": "MNC", "MUN": "MAN"}                    # FPL's short name -> ESPN's, the board's codes
FPL_REGULAR, FPL_BIG_SHARE = 0.60, 0.25


def epl_status(p):
    s, ch = p.get("status"), p.get("chance_of_playing_next_round")
    if s == "i":
        return "Out"
    if s == "s":
        return "Suspended"
    if s == "d":
        return "Doubtful" if ch is not None and ch <= 25 else f"{ch}% to play" if ch is not None else "Doubtful"
    return None                                                # a (available), u (left the club), n (loan rules)


def run_epl(now):
    boot = fetch_json(FPL + "bootstrap-static/")
    fx = fetch_json(FPL + "fixtures/?future=1")
    code = {t["id"]: FPL_TO_ESPN.get(t["short_name"], t["short_name"]) for t in boot["teams"]}
    nxt = next((e["id"] for e in boot.get("events") or [] if e.get("is_next")), None)
    games = {}
    for f in sorted(fx, key=lambda f: f.get("kickoff_time") or "9999"):
        if not f.get("kickoff_time") or f.get("finished") or (nxt and f.get("event") not in (nxt, nxt - 1)):
            continue
        g = {"away": code[f["team_a"]], "home": code[f["team_h"]],
             "kickoff": datetime.fromisoformat(f["kickoff_time"].replace("Z", "+00:00"))}
        if g["kickoff"] < now - timedelta(hours=3):
            continue
        for t in (f["team_a"], f["team_h"]):
            games.setdefault(t, g)
    if not games:
        print("EPL: no upcoming matches; keeping the previous file.")
        return
    played = {}
    for f in fetch_json(FPL + "fixtures/"):
        if f.get("finished"):
            for t, gl in ((f["team_h"], f["team_h_score"]), (f["team_a"], f["team_a_score"])):
                n, goals = played.get(t, (0, 0))
                played[t] = (n + 1, goals + (gl or 0))
    prev = previous("EPL")
    rows = []
    for p in boot["elements"]:
        status = epl_status(p)
        g = games.get(p["team"])
        if not status or not g:
            continue
        n, goals = played.get(p["team"], (0, 0))
        tc = code[p["team"]]
        starts, gi = p.get("starts") or 0, (p.get("goals_scored") or 0) + (p.get("assists") or 0)
        regular = n > 0 and starts / n >= FPL_REGULAR
        share = gi / goals if goals else 0.0
        why = f"Started {starts} of {tc}'s {n} league matches" + (f" · a goal or assist on {gi} of their {goals} goals ({share:.0%})" if gi else "")
        level = "big" if regular and share >= FPL_BIG_SHARE else "some" if regular else "minor"
        kick = g["kickoff"].astimezone(ET)
        full = f"{p.get('first_name', '')} {p.get('second_name', '')}".strip()
        name = p.get("known_name") or (full if len(full.split()) <= 3 else p.get("web_name")) or full
        row = {"sport": "EPL", "away": g["away"], "home": g["home"], "team": tc, "player": name, "status": status,
               "reason": (p.get("news") or "").strip(), "tip": kick.strftime("%a %-I:%M %p"), "tip_sort": kick.strftime("%m%d-%H%M"),
               "starter": regular, "impact": impact(level, why)}
        note = change_note(row, prev)
        if note:
            row["note"] = note
        rows.append(row)
    if not rows:
        print("EPL: nobody flagged for the next matches; keeping the previous file.")
        return
    now_et = now.astimezone(ET)
    write("EPL", {"sport": "EPL", "as_of": now_et.strftime("%a %b %-d · %-I:%M %p ET"), "date": now_et.strftime("%Y-%m-%d")},
          rows, "Fantasy Premier League player status; role scale from its starts and goals (tools/injuries_export.py)")


# ================================================================ other soccer leagues (FotMob)

FOTMOB = "https://www.fotmob.com/api/data/"
BROWSER_UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"}
SOCCER_LINES = ROOT / "live" / "soccer_lines.json"
SOCCER_RECENT, SOCCER_REGULAR, SOCCER_BIG_SHARE = 10, 6, 0.25
SOCCER_LEAGUES = ("LALIGA", "SERIEA", "BUND", "LIGUE1", "UCL", "UEL", "UECL", "MLS", "LIGAMX")   # the EPL has its own


def fetch_ua(url):
    req = urllib.request.Request(url, headers=BROWSER_UA)
    with urllib.request.urlopen(req, timeout=30, context=NFLI.CTX) as r:
        return r.read()


def board_games(path, sports, now, days):
    """The board's games (live/*.json, committed by the lines bots) in `sports` that start in the next `days` days."""
    out = []
    for g in json.loads(path.read_text()).get("games") or []:
        if g.get("sport") not in sports or g.get("state", "pre") != "pre" or not g.get("kickoff"):
            continue
        k = datetime.fromisoformat(g["kickoff"].replace("Z", "+00:00"))
        if now - timedelta(hours=3) <= k <= now + timedelta(days=days):
            out.append({**g, "kick": k})
    return out


def soccer_role(stats, name):
    """(appearances in the club's last 10 matches, goals + assists in them, the club's goals in them), or None. From
    stats/soccer (ESPN box scores): a club's matches are the dates its players logged, its goals their goals."""
    if not stats:
        return None
    ps = stats.get("players") or []
    dates = sorted({r[0] for p in ps for r in p.get("log") or []}, reverse=True)[:SOCCER_RECENT]
    if len(dates) < SOCCER_RECENT // 2:
        return None
    keep = set(dates)
    team_goals = sum(r[1] for p in ps for r in p.get("log") or [] if r[0] in keep)
    want = norm(name)
    hit = [p for p in ps if norm(p["name"]) == want]
    if not hit:                                              # FotMob "Vini Jr." vs ESPN "Vinícius Júnior": last name
        last = want.split()[-1] if want else ""
        hit = [p for p in ps if last and norm(p["name"]).split()[-1:] == [last]]
    if len(hit) != 1:
        return None
    log = [r for r in hit[0].get("log") or [] if r[0] in keep]
    return len(log), sum(r[1] + r[2] for r in log), team_goals, len(dates)


def soccer_impact(role, code):
    if role is None:
        return impact("minor", "Not in DeVig's box scores for this club's recent matches")
    apps, gi, goals, n = role
    regular = apps >= SOCCER_REGULAR
    share = gi / goals if goals else 0.0
    why = f"Played in {apps} of {code}'s last {n} matches" + (f" · a goal or assist on {gi} of their {goals} goals ({share:.0%})" if gi else "")
    return impact("big" if regular and share >= SOCCER_BIG_SHARE else "some" if regular else "minor", why)


def fotmob_status(u):
    kind, back = (u.get("type") or "").lower(), (u.get("expectedReturn") or "").strip()
    if kind == "suspension":
        return "Suspended", "Suspended"
    if back.lower() in ("doubtful", "back in training"):
        return "Doubtful", "Injury · " + back.capitalize()
    return "Out", "Injury" + (f" · expected return: {back[0].lower() + back[1:]}" if back else "")


def run_leagues(now):
    from soccer_lines import same_team                      # the board's own club-name matching
    games = board_games(SOCCER_LINES, set(SOCCER_LEAGUES), now, 3)
    if not games:
        print("Soccer leagues: no upcoming matches on the board; keeping the previous file.")
        return
    fm = []
    for day in sorted({(g["kick"] + timedelta(days=d)).strftime("%Y%m%d") for g in games for d in (-1, 0)}):
        for lg in json.loads(fetch_ua(f"{FOTMOB}matches?date={day}")).get("leagues") or []:
            fm += lg.get("matches") or []
    prev = previous("SOCCER")
    rows, misses = [], []
    for g in games:
        names = g.get("names") or {}
        # same kickoff (to 20 minutes) and at least one club's name: "Hamburg" / "Hamburger SV", "Cologne" / "1. FC Köln"
        hit = next((m for m in fm if (m.get("status") or {}).get("utcTime")
                    and abs(datetime.fromisoformat(m["status"]["utcTime"].replace("Z", "+00:00")) - g["kick"]) <= timedelta(minutes=20)
                    and (same_team((m.get("home") or {}).get("name"), [names.get("home"), g["home"]])
                         or same_team((m.get("away") or {}).get("name"), [names.get("away"), g["away"]]))), None)
        if not hit:
            misses.append(f"{g['sport']} {g['away']}@{g['home']}")
            continue
        lu = ((json.loads(fetch_ua(f"{FOTMOB}matchDetails?matchId={hit['id']}")).get("content") or {}).get("lineup")) or {}
        kick = g["kick"].astimezone(ET)
        for side, key in (("home", "homeTeam"), ("away", "awayTeam")):
            code = g[side]
            stats = team_stats("SOCCER", (g.get("ids") or {}).get(side, ""))
            for p in (lu.get(key) or {}).get("unavailable") or []:
                status, reason = fotmob_status(p.get("unavailability") or {})
                imp = soccer_impact(soccer_role(stats, p.get("name") or ""), code)
                row = {"sport": g["sport"], "away": g["away"], "home": g["home"], "team": code, "player": p.get("name") or "",
                       "status": status, "reason": reason, "tip": kick.strftime("%a %-I:%M %p"),
                       "tip_sort": kick.strftime("%m%d-%H%M"), "starter": imp["level"] != "minor", "impact": imp}
                note = change_note(row, prev)
                if note:
                    row["note"] = note
                rows.append(row)
    if misses:
        print(f"Soccer leagues: {len(misses)} board matches not found on FotMob: {', '.join(misses[:8])}")
    if not rows:
        print("Soccer leagues: FotMob listed nobody for the board's matches; keeping the previous file.")
        return
    now_et = now.astimezone(ET)
    write("SOCCER", {"sport": "SOCCER", "as_of": now_et.strftime("%a %b %-d · %-I:%M %p ET"), "date": now_et.strftime("%Y-%m-%d")},
          rows, "FotMob match pages (unavailable players); role scale from stats/soccer (tools/injuries_export.py)")


# ================================================================ college (Covers.com)

COVERS = {"CFB": "https://www.covers.com/sport/football/ncaaf/injuries",
          "CBB": "https://www.covers.com/sport/basketball/ncaab/injuries"}
GAME_LINES = ROOT / "live" / "game_lines.json"
COLLEGE_STALE_DAYS = 21                    # a Questionable / Probable not updated in 3 weeks is dropped; Out is kept
CFB_BIG_SHARE, CFB_SOME_SHARE, CFB_TACKLE_SHARE = 0.25, 0.10, 0.06
COVERS_TEAM = re.compile(r'imgLink"[^>]*>\s*(.*?)<br>\s*<span>(.*?)</span>', re.S)
COVERS_ROW = re.compile(r"<(?:span|a)\b([^>]*)class='player-link'[^>]*>(.*?)</(?:span|a)>\s*</td>\s*<td>(.*?)</td>\s*"
                        r"<td><b>(.*?)</b><br>\((.*?)\)", re.S)


def text(s):
    return " ".join(html_unescape(re.sub(r"<[^>]+>", " ", s)).split())


def covers_teams(page):
    """[(location, nickname, [(name, link slug or None, pos, status text, date text)])] from a Covers injuries page."""
    out = []
    for b in page.split("covers-CoversSeasonInjuries-teamNameColumn")[1:]:
        m = COVERS_TEAM.search(b)
        if not m:
            continue
        rows = []
        for attrs, name, pos, status, date in COVERS_ROW.findall(b):
            link = re.search(r"/players/\d+/([a-z0-9-]+)", attrs)
            rows.append((text(name), link.group(1) if link else None, text(pos), text(status), text(date)))
        out.append((text(m.group(1)), text(m.group(2)), rows))
    return out


def covers_date(s, now):
    """'Sun, Oct 18' -> that date, in the year that puts it on or before now."""
    try:
        d = datetime.strptime(f"{s.split(', ', 1)[-1]} {now.year}", "%b %d %Y").replace(tzinfo=ET)
    except ValueError:
        return None
    return d.replace(year=d.year - 1) if d > now + timedelta(days=1) else d


def initials_match(short, full):
    """Covers' 'S. Maiava-Alaimalo' against a full name: same last name(s), same first initial."""
    s, f = norm(short).split(), norm(full).split()
    if len(s) < 2 or not f:
        return False
    rest = s[1:]
    return f[0][:1] == s[0][:1] and f[-len(rest):] == rest


def cfb_impact(stats, short, pos, code):
    """(full name or None, impact) from stats/cfb's per-game numbers this season: a role measure, not a measured effect."""
    ps = (stats or {}).get("players") or []
    hit = [p for p in ps if initials_match(short, p["name"])]
    if len(hit) != 1:
        return None, impact("minor", "Not in this season's box scores" if not hit else "Two players on the roster match this name")
    p = hit[0]
    tot = lambda q, k: ((q.get("this") or {}).get(k) or 0) * ((q.get("this") or {}).get("gp") or 0)   # noqa: E731
    att = {q["id"]: tot(q, "att") for q in ps}
    if pos == "QB" or p.get("grp") == "QB":
        if att.get(p["id"]) and att[p["id"]] == max(att.values()):
            share = att[p["id"]] / (sum(att.values()) or 1)
            return p["name"], impact("big", f"{code}'s main passer: {share:.0%} of its pass attempts this season")
    yds = {q["id"]: tot(q, "rush_yds") + tot(q, "rec_yds") for q in ps}
    team_yds = sum(v for v in yds.values() if v > 0)
    share = yds[p["id"]] / team_yds if team_yds and yds[p["id"]] > 0 else 0.0
    if share >= CFB_SOME_SHARE:
        lv = "big" if share >= CFB_BIG_SHARE else "some"
        return p["name"], impact(lv, f"{share:.0%} of {code}'s rushing and receiving yards this season")
    tk = {q["id"]: tot(q, "tkl") for q in ps}
    tshare = tk[p["id"]] / (sum(tk.values()) or 1)
    if tshare >= CFB_TACKLE_SHARE:
        return p["name"], impact("some", f"{tshare:.0%} of {code}'s tackles this season")
    gp = (p.get("this") or {}).get("gp") or 0
    return p["name"], impact("minor", f"{gp} game{'' if gp == 1 else 's'} this season, a small share of the team's yards and tackles")


def run_college(sport, now):
    games = board_games(GAME_LINES, {sport}, now, 3)
    if not games:
        print(f"{sport}: no games on the board in the next three days; keeping the previous file.")
        return
    by_name = {}
    for g in games:
        for side in ("away", "home"):
            by_name.setdefault(norm((g.get("names") or {}).get(side, "")), (g[side], g))
    full_names = {}
    if sport == "CFB":
        idx = json.loads((STATS / "cfb" / "index.json").read_text())
        full_names = {norm(t["name"]): t["code"] for t in idx.get("teams") or []}
    teams = covers_teams(fetch_ua(COVERS[sport]).decode("utf-8", "replace"))
    if len(teams) < 50:
        raise ValueError(f"Covers page had {len(teams)} teams; its layout may have changed")
    prev = previous(sport)
    rows, cache = [], {}
    for loc, nick, injuries in teams:
        scode = full_names.get(norm(f"{loc} {nick}"))         # stats/cfb's code (ESPN's: AF), the board may differ (AFA)
        hit = by_name.get(norm(loc))
        if not hit and scode:
            hit = next(((scode, g) for g in games if scode in (g["away"], g["home"])), None)
        if not hit:
            continue                                         # no game on the board in the next three days
        code, g = hit
        kick = g["kick"].astimezone(ET)
        for short, link, pos, st, date in injuries:
            status, _, why = st.partition(" - ")
            status = "Injured Reserve" if status.strip() == "IR" else status.strip()
            when = covers_date(date, now)
            if not status or (when and not re.search(r"out|reserve", status, re.I)
                              and when < now - timedelta(days=COLLEGE_STALE_DAYS)):
                continue
            name, imp = short, None
            if sport == "CFB":
                k = scode or code
                if k not in cache:
                    cache[k] = team_stats("CFB", k)
                full, imp = cfb_impact(cache[k], short, pos, code)
                name = full or short
            elif link:
                name = link.replace("-", " ").title().replace("Jr", "Jr.").replace("Iii", "III").replace("Ii", "II")
            reason = " · ".join(x for x in (pos, why.strip(), f"reported {when:%b %-d}" if when else "") if x)
            row = {"sport": sport, "away": g["away"], "home": g["home"], "team": code, "player": name, "status": status,
                   "reason": reason, "tip": kick.strftime("%a %-I:%M %p"), "tip_sort": kick.strftime("%m%d-%H%M"),
                   "starter": bool(imp and imp["level"] != "minor"), "impact": imp}
            note = change_note(row, prev)
            if note:
                row["note"] = note
            rows.append(row)
    if not rows:
        print(f"{sport}: Covers listed nobody for the board's next games; keeping the previous file.")
        return
    now_et = now.astimezone(ET)
    write(sport, {"sport": sport, "as_of": now_et.strftime("%a %b %-d · %-I:%M %p ET"), "date": now_et.strftime("%Y-%m-%d")},
          rows, "Covers.com injury report" + ("; role scale from stats/cfb" if sport == "CFB" else "") + " (tools/injuries_export.py)")


# ================================================================ NFL

def nfl_week_games(now):
    import models_compare as MC
    games = [g for g in MC.nfl_games() if g["home_score"] is None and g["kickoff"] > now - timedelta(hours=4)]
    if not games:
        return []
    week = lambda g: int(g["game_id"].split("_")[1])            # noqa: E731  "2026_09_ARI_DAL" -> 9
    first = min(games, key=lambda g: g["kickoff"])
    return [g for g in games if g["season"] == first["season"] and week(g) == week(first)]


def nfl_touch_shares(stats):
    """{norm name: share of the team's targets plus carries} this season."""
    if not stats:
        return {}
    vol = {}
    for p in stats.get("players", []):
        th = p.get("this") or {}
        v = ((th.get("tgt") or 0) + (th.get("car") or 0)) * (th.get("gp") or 0)
        if v:
            vol[norm(p["name"])] = v
    total = sum(vol.values())
    return {k: v / total for k, v in vol.items()} if total else {}


def nfl_impact(pos, share, code, touch):
    ctx = f" · {touch:.0%} of {code}'s targets and carries" if touch and touch >= 0.08 and pos in ("RB", "WR", "TE") else ""
    if share is None:
        return impact("minor", "No snaps this season")
    if pos == "QB" and share >= NFL_REGULAR_SHARE:
        return impact("gamechanger", f"Starting QB ({share:.0%} of snaps): about {NFL_QB_POINTS} points of final margin "
                                     f"in DeVig's injury study")
    if share >= NFL_REGULAR_SHARE:
        return impact("some", f"Regular ({share:.0%} of snaps): about {NFL_REGULAR_POINTS} points each in DeVig's "
                              f"injury study{ctx}")
    return impact("minor", f"Part-time ({share:.0%} of snaps){ctx}")


def run_nfl(now):
    games = nfl_week_games(now)
    if not games:
        print("NFL: no games left this week; keeping the previous file.")
        return
    feed = NFLI.fetch_espn()
    season = games[0]["season"]
    cur, last = NFLI.snap_shares(season), NFLI.snap_shares(season - 1)
    if not cur:
        print("NFL: no snap counts for this season; keeping the previous file.")
        return
    last_by_name = {}
    for (team, nm), v in last.items():
        last_by_name.setdefault(nm, []).append(v)
    by_team = {}
    for g in games:
        by_team[g["home"]] = g
        by_team[g["away"]] = g
    prev = previous("NFL")
    rows = []
    for t in feed.get("injuries", []):
        code = NFLI.ESPN_TO_ABBR.get(t.get("displayName"))
        g = by_team.get(code)
        if not g:
            continue
        touch = nfl_touch_shares(team_stats("NFL", code))
        for inj in t.get("injuries", []):
            status = (inj.get("status") or "").strip()
            if not status or status.lower() == "active":
                continue
            ath = inj.get("athlete") or {}
            name = ath.get("displayName") or ""
            nm = norm(name)
            hit = cur.get((code, nm))
            if hit is None and len(last_by_name.get(nm, [])) == 1:
                hit = last_by_name[nm][0]
            share = hit[0] if hit else None
            pos = (((ath.get("position") or {}).get("abbreviation")) or (hit[1] if hit else "")).upper()
            regular = share is not None and share >= NFL_REGULAR_SHARE
            if status not in NFL_DESIGNATIONS and not regular:
                continue                                   # long-term lists (IR, PUP ...) only for regulars
            details = inj.get("details") or {}
            kick = g["kickoff"].astimezone(ET)
            # official game statuses come out two days before the game (Friday for Sunday): by the calendar, since
            # ESPN's timestamp is the latest news item, not when the status was set
            final_due = (kick - timedelta(days=2)).replace(hour=16, minute=0, second=0, microsecond=0)
            fresh = now.astimezone(ET) >= final_due
            row = {"sport": "NFL", "away": g["away"], "home": g["home"], "team": code, "player": name, "status": status,
                   "reason": " · ".join(x for x in (pos, details.get("type")) if x),
                   "tip": kick.strftime("%a %-I:%M %p"), "tip_sort": kick.strftime("%m%d-%H%M"),
                   "starter": share is not None and share >= NFL_STARTER_SHARE, "confirmed": fresh,
                   "impact": nfl_impact(pos, share, code, touch.get(nm))}
            note = change_note(row, prev)
            if not fresh and status in NFL_DESIGNATIONS:
                note = "Practice-week status; the official game status comes out " + final_due.strftime("%A")
            if note:
                row["note"] = note
            rows.append(row)
    if not rows:
        print("NFL: ESPN listed nobody for this week's teams; keeping the previous file.")
        return
    wk = int(games[0]["game_id"].split("_")[1])
    now_et = now.astimezone(ET)
    write("NFL", {"sport": "NFL", "as_of": now_et.strftime(f"%a %b %-d · %-I:%M %p ET · Week {wk}"),
                  "date": now_et.strftime("%Y-%m-%d")}, rows,
          "ESPN injury feed + nflverse snap counts; game changer scale from DeVig's injury study (tools/injuries_export.py)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sport", choices=list(OUT))
    ap.add_argument("--now")
    a = ap.parse_args()
    now = datetime.fromisoformat(a.now.replace("Z", "+00:00")) if a.now else datetime.now(timezone.utc)
    failed = False
    for sport, fn in (("NBA", run_nba), ("NFL", run_nfl), ("NHL", run_nhl), ("EPL", run_epl), ("SOCCER", run_leagues),
                      ("CFB", lambda n: run_college("CFB", n)), ("CBB", lambda n: run_college("CBB", n))):
        if a.sport and a.sport != sport:
            continue
        try:
            fn(now)
        except Exception as e:                                   # one sport's source failing never blocks the other
            failed = True
            print(f"::warning::{sport} injuries not updated ({type(e).__name__}: {e}); keeping the previous file.")
    return 1 if failed and a.sport else 0


if __name__ == "__main__":
    sys.exit(main())
