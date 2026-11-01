"""Player -> ESPN athlete id for the headshots on DeVig's props (NBA, NFL, NHL).

Reads every team's roster from ESPN's public site API (no key) and writes {sport}/headshots.json:
  {"generated_at": ..., "players": {"<normalized name>": [["<espn id>", "<espn team abbr, lower>"], ...]}}
A name can map to more than one player; the app picks the one on a team in the game. Display only: no model reads this.
Run daily by .github/workflows/espn_headshots.yml. Stdlib only.
"""
import json
import re
import sys
import time
import unicodedata
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://site.api.espn.com/apis/site/v2/sports/{path}"
SPORTS = {"nba": "basketball/nba", "nfl": "football/nfl", "nhl": "hockey/nhl"}
SUFFIX = re.compile(r"\b(jr|sr|ii|iii|iv|v)\b")


def norm(name: str) -> str:
    """Must match normName() in web/src/lib/headshots.ts."""
    s = unicodedata.normalize("NFD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[.'’]", "", s)
    s = SUFFIX.sub("", s.replace("-", " "))
    return re.sub(r"\s+", " ", s).strip()


def get(url: str):
    for i in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "devig-headshots/1"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001 - retry any network hiccup
            if i == 3:
                print(f"  failed {url}: {e}", file=sys.stderr)
                return None
            time.sleep(2 * (i + 1))


def athletes(roster: dict):
    for a in roster.get("athletes") or []:
        # NFL/NHL group players by position ({"items": [...]}); NBA lists them flat
        yield from (a.get("items") or []) if "items" in a else [a]


def build(sport: str, path: str) -> dict:
    teams = get(API.format(path=f"{path}/teams"))
    teams = [t["team"] for t in teams["sports"][0]["leagues"][0]["teams"]] if teams else []
    players: dict[str, list] = {}
    for t in teams:
        r = get(API.format(path=f"{path}/teams/{t['id']}/roster"))
        if not r:
            continue
        abbr = t["abbreviation"].lower()
        for a in athletes(r):
            pid, name = str(a.get("id") or ""), a.get("fullName") or a.get("displayName")
            if pid.isdigit() and name:
                hit = players.setdefault(norm(name), [])
                if [pid, abbr] not in hit:
                    hit.append([pid, abbr])
        time.sleep(0.2)
    print(f"{sport}: {len(teams)} teams, {len(players)} names")
    return {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "players": players}


def main():
    for sport, path in SPORTS.items():
        out = build(sport, path)
        if len(out["players"]) < 200:  # a bad fetch keeps yesterday's file rather than blanking the photos
            print(f"{sport}: too few players, keeping the old file")
            continue
        (ROOT / sport / "headshots.json").write_text(json.dumps(out, separators=(",", ":"), sort_keys=True))


if __name__ == "__main__":
    main()
