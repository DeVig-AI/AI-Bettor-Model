#!/usr/bin/env python3
"""
props_ladder_history.py -- how often past Kalshi player-prop rungs actually hit, by the price you'd have paid.

Reads the settled Kalshi prop markets the history bots already saved ({nba,nhl}/props_history/kalshi/*.csv: the
price shortly before the game and how the market settled) and writes stats/props_ladder.json for the v2 app's
ladder view. Descriptive only: it says "last season, overs bought at 70-80c hit 72% of the time"; it is not a
pre-registered test and the app never calls it an edge. Prices this script reads were already used by the props
back-tests.

For every rung with a usable price (bid > 0, ask < 1, ask - bid <= 6c):
  * over  = buy YES at the ask;  under = buy NO at 1 - bid;
  * price paid includes Kalshi's taker fee estimate 0.07 x P x (1 - P);
  * grouped by sport, side, stat ("all" too) and 10c bucket of the price paid (before the fee, so the app can
    look a rung up from its ask or bid alone).
Also counts ladder mistakes between neighbouring rungs of the same player, stat and game:
  * dominated = the harder rung's ask is at or above the easier rung's ask (same price, less chance);
  * crossed   = the harder rung's bid is above the easier rung's ask (YES easier + NO harder costs < $1 after fees
                and pays at least $1 whatever happens).
Run from the repo root:  python3 tools/props_ladder_history.py
"""
import collections, csv, glob, json, os
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPORTS = ["nba", "nhl"]
MAX_SPREAD = 0.06
MIN_N = 100  # buckets with fewer settled rungs are left out


def fee(p):
    return 0.07 * p * (1 - p)


def load(sport):
    rows = []
    for f in sorted(glob.glob(os.path.join(ROOT, sport, "props_history", "kalshi", "*.csv"))):
        with open(f, newline="") as fh:
            for r in csv.DictReader(fh):
                if r.get("result") not in ("yes", "no") or not r.get("yes_bid") or not r.get("yes_ask"):
                    continue
                try:
                    b, a, line = float(r["yes_bid"]), float(r["yes_ask"]), float(r["line"])
                except ValueError:
                    continue
                if b <= 0 or a >= 1 or a - b > MAX_SPREAD or a < b:
                    continue
                rows.append({"ev": r["event_ticker"], "player": r["player"], "stat": r["stat"], "line": line,
                             "bid": b, "ask": a, "yes": r["result"] == "yes", "season": r.get("season", "")})
    return rows


def table(rows):
    acc = collections.defaultdict(lambda: [0, 0.0, 0])  # n, paid (fee in), hits
    for r in rows:
        for side, px, won in (("over", r["ask"], r["yes"]), ("under", 1 - r["bid"], not r["yes"])):
            bucket = min(9, int(px * 10))
            for stat in ("all", r["stat"]):
                a = acc[(side, stat, bucket)]
                a[0] += 1
                a[1] += px + fee(px)
                a[2] += won
    out = {}
    for (side, stat, bucket), (n, paid, hits) in sorted(acc.items()):
        if n < MIN_N:
            continue
        out.setdefault(side, {}).setdefault(stat, {})[str(bucket)] = {
            "n": n, "paid": round(paid / n, 4), "hit": round(hits / n, 4)}
    return out


def mistakes(rows):
    lad = collections.defaultdict(list)
    for r in rows:
        lad[(r["ev"], r["player"], r["stat"])].append(r)
    pairs = dominated = crossed = 0
    for rs in lad.values():
        rs.sort(key=lambda r: r["line"])
        for easy, hard in zip(rs, rs[1:]):
            pairs += 1
            if hard["ask"] >= easy["ask"]:
                dominated += 1
            if easy["ask"] + fee(easy["ask"]) + (1 - hard["bid"]) + fee(1 - hard["bid"]) < 1:
                crossed += 1
    return {"pairs": pairs, "dominated": dominated, "crossed": crossed}


def main():
    doc = {"updated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "note": "Descriptive: past Kalshi prop prices vs how often they hit. Not a pre-registered test.",
           "max_spread": MAX_SPREAD, "min_n": MIN_N, "sports": {}}
    for s in SPORTS:
        rows = load(s)
        if not rows:
            continue
        seasons = sorted({r["season"] for r in rows if r["season"]})
        doc["sports"][s.upper()] = {"rungs": len(rows), "seasons": seasons, "table": table(rows),
                                    "mistakes": mistakes(rows)}
        print(s, len(rows), "rungs", doc["sports"][s.upper()]["mistakes"])
    path = os.path.join(ROOT, "stats", "props_ladder.json")
    with open(path, "w") as fh:
        json.dump(doc, fh, separators=(",", ":"))
    print("wrote", path, os.path.getsize(path), "bytes")


if __name__ == "__main__":
    main()
