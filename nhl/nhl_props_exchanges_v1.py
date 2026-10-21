#!/usr/bin/env python3
"""
nhl_props_exchanges_v1.py -- pulls open Kalshi NHL player-prop markets (goals, points, assists: KXNHLGOAL, KXNHLPTS,
KXNHLAST) from the public API (no key, no account, nothing bet) and writes nhl/props_exchanges_export.json, in the same
shape as the NBA export. A market "Name: N+ goals" is stored as Over N-0.5. Puck drop, teams and game id come from the
NHL API schedule. Run from the repo root:  python3 nhl/nhl_props_exchanges_v1.py
"""
import hashlib, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nhl_kalshi_common_v1 as K  # noqa: E402

OUT = os.path.join(HERE, "props_exchanges_export.json")


def fnum(x):
    try:
        v = float(x)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def main():
    now = K.now_utc()
    games, nq = {}, 0
    for tk, stat in K.SERIES.items():
        cursor = None
        for _ in range(10):
            d = K.get(K.KALSHI + "/events", {"series_ticker": tk, "status": "open", "with_nested_markets": "true",
                                             "limit": 100, "cursor": cursor})
            if not d:
                break
            for ev in d.get("events") or []:
                et = ev.get("event_ticker")
                g = K.game_of(et)
                if not g:
                    K.log.append(f"no game for {et}"); continue
                key = f"{g['date']}_{g['away']}_{g['home']}"
                doc = games.setdefault(key, {"meta": {"game_key": key, "game_date": g["date"], "away_team": g["away"],
                                                      "home_team": g["home"], "kickoff_time": K.iso(g["start"]),
                                                      "nhl_game_id": g["game_id"], "game_type": g["game_type"],
                                                      "season": g["season"]}, "rows": {}})
                for m in ev.get("markets") or []:
                    if m.get("status") not in (None, "active", "open") or not K.is_over_market(m):
                        continue
                    player, line = K.label(m)[0], K.line_of(m)
                    if not player or line is None:
                        continue
                    doc["rows"][(K.norm(player), stat, line)] = {
                        "player": player, "stat": stat, "line": line,
                        "k": {"bid": fnum(m.get("yes_bid_dollars")), "ask": fnum(m.get("yes_ask_dollars")),
                              "last": fnum(m.get("last_price_dollars")), "oi": fnum(m.get("open_interest_fp")),
                              "vol": fnum(m.get("volume_fp")), "t": m.get("ticker"), "e": et}}
                    nq += 1
            cursor = d.get("cursor")
            if not cursor:
                break
    stamp = K.iso(now)
    docs = []
    for key, g in sorted(games.items()):
        rows = sorted(g["rows"].values(), key=lambda r: (r["stat"], r["player"], r["line"]))
        data = dict(g["meta"], sport="NHL", source="kalshi public market data", fetched_at=stamp, n_rows=len(rows),
                    note="Exchange prices = market's implied chance (0-1). Not sportsbook odds, not picks.", rows=rows)
        data["export_hash"] = hashlib.sha256(json.dumps({k: v for k, v in data.items() if k != "fetched_at"},
                                                        sort_keys=True).encode()).hexdigest()
        docs.append({"collection": "props", "doc_id": key, "data": data})
    out = {"sport": "NHL_PROPS", "generated_at": stamp, "n_docs": len(docs), "series": K.SERIES,
           "counts": {"kalshi_quotes": nq, "rows": sum(d["data"]["n_rows"] for d in docs)}, "errors": K.log[:100],
           "docs": docs}
    json.dump(out, open(OUT, "w"), separators=(",", ":"))
    print(json.dumps({k: out[k] for k in ("generated_at", "n_docs", "counts")}, indent=1))


if __name__ == "__main__":
    sys.exit(main())
