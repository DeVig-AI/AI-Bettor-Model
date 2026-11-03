#!/usr/bin/env python3
"""
props_ladder_history.py -- how often past Kalshi player-prop rungs actually hit, by the price you'd have paid.

Reads the settled Kalshi prop markets the history bots already saved ({nba,nhl}/props_history/kalshi/*.csv: the
price shortly before the game and how the market settled) plus every rung the live props bots locked before a game
and later graded (nba/NBA_PROPS_MODEL_V2_LOG.sqlite3, nhl/NHL_PROPS_MODEL_V1_LOG.sqlite3: locked_rows + grades), and
writes stats/props_ladder.json for the v2 app's ladder view. .github/workflows/props_ladder.yml reruns it daily. Descriptive only: it says "last season, overs bought at 70-80c hit 72% of the time"; it is not a
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
import collections, csv, glob, json, os, sqlite3
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
                if not ok_price(b, a):
                    continue
                rows.append({"ev": r["event_ticker"], "player": r["player"], "stat": r["stat"], "line": line,
                             "bid": b, "ask": a, "yes": r["result"] == "yes", "ticker": r.get("ticker", ""),
                             "season": season_label(sport, r["season"]) if r.get("season", "").isdigit() else ""})
    return rows


LIVE_DB = {"nba": "nba/NBA_PROPS_MODEL_V2_LOG.sqlite3", "nhl": "nhl/NHL_PROPS_MODEL_V1_LOG.sqlite3"}


def season_label(sport, y):
    """'2025-26'. The NBA history labels a season by the year it ends, the NHL one by the year it starts."""
    y = int(y)
    start = y - 1 if sport == "nba" else y
    return f"{start}-{(start + 1) % 100:02d}"


def ok_price(b, a):
    return b is not None and a is not None and 0 < b <= a < 1 and a - b <= MAX_SPREAD


def load_live(sport, seen):
    """Rungs the live bot locked before the game (its bid / ask) and graded from Kalshi's settlement."""
    path = os.path.join(ROOT, LIVE_DB[sport])
    if not os.path.exists(path):
        return []
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    q = """select r.event_ticker, r.player, r.stat, r.line, r.k_bid, r.k_ask, g.result, r.lock_utc, r.ticker
           from locked_rows r join grades g on g.ticker = r.ticker where g.result in ('yes', 'no')"""
    rows = []
    for ev, player, stat, line, b, a, res, lock, ticker in con.execute(q):
        if ticker in seen or not ok_price(b, a):
            continue
        y, m = int(lock[:4]), int(lock[5:7])
        start = y if m >= 8 else y - 1
        rows.append({"ev": ev, "player": player, "stat": stat, "line": float(line), "bid": b, "ask": a,
                     "yes": res == "yes", "season": f"{start}-{(start + 1) % 100:02d}"})
    con.close()
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
        hist = load(s)
        live = load_live(s, {r["ticker"] for r in hist})
        rows = hist + live
        if not rows:
            continue
        seasons = sorted({r["season"] for r in rows if r["season"]})
        doc["sports"][s.upper()] = {"rungs": len(rows), "history_rungs": len(hist), "live_rungs": len(live),
                                    "seasons": seasons, "table": table(rows), "mistakes": mistakes(rows)}
        print(s, len(hist), "history +", len(live), "live rungs", doc["sports"][s.upper()]["mistakes"])
    path = os.path.join(ROOT, "stats", "props_ladder.json")
    with open(path, "w") as fh:
        json.dump(doc, fh, separators=(",", ":"))
    print("wrote", path, os.path.getsize(path), "bytes")


if __name__ == "__main__":
    main()
