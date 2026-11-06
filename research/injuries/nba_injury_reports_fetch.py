#!/usr/bin/env python3
"""
nba_injury_reports_fetch.py -- the inputs for NBA_MODELC_PLUS_INJURIES_V1_PREREG.md, into a cache outside the repo
(never committed): sportsdataverse player box scores for 2022-23 .. 2025-26, and for each regular-season game the
official NBA injury report PDF chosen by the pre-registration (latest on-the-hour report at least 30 minutes before
tip, Eastern time, falling back hour by hour to 8 AM), with its text extracted.

Text extraction uses macOS PDFKit through JavaScript for Automation (osascript), so this step runs on a Mac.
Usage: python3 research/injuries/nba_injury_reports_fetch.py <cache dir>
"""
import subprocess
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SEASONS = [2023, 2024, 2025, 2026]
BOX = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_player_boxscores/player_box_{y}.csv"
PDF = "https://ak-static.cms.nba.com/referee/injury/Injury-Report_{d}_{t}.pdf"
UA = "devig-research/1.0 (public research; read-only)"
FIRST_HOUR = 8


def get(url, tries=3):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                return None
            if k == tries - 1:
                raise
        except Exception:
            if k == tries - 1:
                raise
        time.sleep(2 * (k + 1))


def hour_names(h):
    """Both file-name styles for an hour (24h): '05PM' and '05_00PM'."""
    ap = "AM" if h < 12 else "PM"
    h12 = h % 12 or 12
    return [f"{h12:02d}{ap}", f"{h12:02d}_00{ap}"]


def wanted(games):
    """{(ET date, hour)} needed: for each game, every hour from the latest at least 30 min before tip down to 8 AM."""
    out = {}
    for eid, ts in zip(games["event_id"], games["date_utc"]):
        et = (ts - pd.Timedelta(minutes=30)).tz_convert("America/New_York")
        out[eid] = (et.strftime("%Y-%m-%d"), list(range(min(et.hour, 23), FIRST_HOUR - 1, -1)))
    return out


def main(cache):
    cache = Path(cache)
    (cache / "pdf").mkdir(parents=True, exist_ok=True)
    (cache / "txt").mkdir(parents=True, exist_ok=True)
    for y in SEASONS:
        f = cache / f"player_box_{y}.csv"
        if not f.exists():
            f.write_bytes(get(BOX.format(y=y)))
            print("box", y, f.stat().st_size)
    games = pd.concat([pd.read_csv(ROOT / "nba" / f"nba_games_raw_season{y}.csv") for y in SEASONS])
    games = games[games["season_type"] == 2].copy()
    games["date_utc"] = pd.to_datetime(games["date_utc"], utc=True)
    need = wanted(games)

    def fetch(day_hour):
        d, h = day_hour
        stem = f"{d}_{h:02d}"
        p = cache / "pdf" / f"{stem}.pdf"
        miss = cache / "pdf" / f"{stem}.missing"
        if p.exists():
            return day_hour, True
        if miss.exists():
            return day_hour, False
        for t in hour_names(h):
            b = get(PDF.format(d=d, t=t))
            if b and b[:4] == b"%PDF":
                p.write_bytes(b)
                return day_hour, True
        miss.write_text("")
        return day_hour, False

    # Fetch only as far back as needed: for each game, stop at the first hour that exists.
    have = {}
    pending = {eid: list(hs) for eid, (d, hs) in need.items()}
    days = {eid: d for eid, (d, _) in need.items()}
    with ThreadPoolExecutor(8) as ex:
        while pending:
            ask = {(days[e], hs[0]) for e, hs in pending.items() if (days[e], hs[0]) not in have}
            for dh, ok in ex.map(fetch, sorted(ask)):
                have[dh] = ok
            nxt = {}
            for e, hs in pending.items():
                if not have[(days[e], hs[0])] and len(hs) > 1:
                    nxt[e] = hs[1:]
            pending = nxt
            print(f"{sum(have.values())} reports, {len(pending)} games still looking", flush=True)

    todo = [p for p in sorted((cache / "pdf").glob("*.pdf")) if not (cache / "txt" / (p.stem + ".txt")).exists()]
    js = """function run(argv){ObjC.import('Quartz');ObjC.import('Foundation');
      for (var i=0;i<argv.length;i+=2){var d=$.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(argv[i]));
        var s=d?d.string.js:'';$(s).writeToFileAtomicallyEncodingError(argv[i+1],true,4,null);}}"""
    for k in range(0, len(todo), 100):
        args = []
        for p in todo[k:k + 100]:
            args += [str(p), str(cache / "txt" / (p.stem + ".txt"))]
        subprocess.run(["osascript", "-l", "JavaScript", "-e", js, *args], check=True)
        print("text", min(k + 100, len(todo)), "/", len(todo), flush=True)


if __name__ == "__main__":
    main(sys.argv[1])
