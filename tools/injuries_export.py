#!/usr/bin/env python3
"""
injuries_export.py -- the app's Injuries tab (nba/injuries_export.json, nfl/injuries_export.json), refreshed by a bot
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
The scale is how much is lost IF he misses the game; his status (Out / Questionable / ...) is separate.

A status that changed since the previous run gets a note ("Downgraded from Questionable"). If a source can't be
read, that sport's previous file is left unchanged.

Usage:  python3 tools/injuries_export.py [--sport NBA|NFL] [--now ISO]
"""
import argparse
import io
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
OUT = {"NBA": ROOT / "nba" / "injuries_export.json", "NFL": ROOT / "nfl" / "injuries_export.json"}
STATS = ROOT / "stats"
NBA_REPORT = "https://ak-static.cms.nba.com/referee/injury/Injury-Report_{date}_{time}.pdf"

LEVELS = {"gamechanger": ("Game changer", 4), "big": ("Big", 3), "some": ("Some", 2), "minor": ("Minor", 1)}
NBA_CUTS = ((0.15, "gamechanger"), (0.11, "big"), (0.07, "some"))
NFL_QB_POINTS, NFL_REGULAR_POINTS, NFL_REGULAR_SHARE = 3.8, 0.5, 0.50     # research/injuries/results_v1.md
NFL_STARTER_SHARE = 0.60                                                   # the page's "starter" (60%+ of snaps)
STATUS_RANK = {"Out": 0, "Doubtful": 1, "Questionable": 2, "Probable": 3, "Available": 4}
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
    OUT[sport].write_text(json.dumps({"generated_at": now, "source": source, "docs": docs}, indent=1, sort_keys=True) + "\n")
    print(f"{sport}: {len(docs) - 1} players written to {OUT[sport].relative_to(ROOT)}")


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
    ap.add_argument("--sport", choices=["NBA", "NFL"])
    ap.add_argument("--now")
    a = ap.parse_args()
    now = datetime.fromisoformat(a.now.replace("Z", "+00:00")) if a.now else datetime.now(timezone.utc)
    failed = False
    for sport, fn in (("NBA", run_nba), ("NFL", run_nfl)):
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
