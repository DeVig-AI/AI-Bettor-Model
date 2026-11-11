#!/usr/bin/env python3
"""
sharps_log.py -- where Polymarket's top sports earners put their moneyline money, locked at each game's start.

A quiet paper test (SHARPS_LIVE_V1_PREREG.md): nothing here is shown in the app, makes a pick or places a bet. Public
read-only endpoints (gamma-api / data-api.polymarket.com), no key, no account.

Each run (twice an hour, after tools/poly_lines.py in game_lines.yml):
  1. Before the start: every game in live/poly_lines.json (the app's NBA, NHL, NFL, CFB and MLB games, matched to their
     Polymarket event) is kept in live/sharps/pending.json with the latest pre-game snapshot of Polymarket's top 20
     sports earners this month, Polymarket's price and Kalshi's moneyline from live/models/latest.json. Only snapshots
     taken before the start are ever used, so a game's own result can't move a trader into the top 20.
  2. After the start: the game is locked once into live/sharps/LOCKS.csv (append-only). For each of those 20 wallets,
     its moneyline trades on the game made before the start (buys minus sells, in dollars, per team). A trader counts
     for a team when they put at least $1,000 more on it than on the other team. The "sharp side" is the team with
     more counted money. If any trader's history can't be read, the game waits for the next run.

Usage: python3 tools/sharps_log.py
"""
import csv
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import kalshi_games_v1 as KG  # noqa: E402

GAMMA = "https://gamma-api.polymarket.com"
DATA = "https://data-api.polymarket.com/v2"
POLY = ROOT / "live" / "poly_lines.json"
MODELS = ROOT / "live" / "models" / "latest.json"
DIR = ROOT / "live" / "sharps"
PENDING = DIR / "pending.json"
LOCKS = DIR / "LOCKS.csv"
TOP_N = 20
MIN_USD = 1000.0          # a trader counts only with at least this much more on one team than the other
GIVE_UP = timedelta(hours=72)  # a game still unlocked this long after its start is logged as missed
COLUMNS = ["locked_at", "key", "sport", "date", "away", "home", "kickoff", "slug", "condition_id", "status",
           "board_at", "kalshi_seen", "kalshi_away_ml", "kalshi_home_ml", "kalshi_home_wp", "poly_at", "poly_away_mid",
           "n_away", "n_home", "usd_away", "usd_home", "sharp_side", "heads_side", "traders"]


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_t(s):
    s = str(s or "").strip().replace(" ", "T").replace("Z", "+00:00")
    if s.endswith("+00"):
        s += ":00"
    try:
        t = datetime.fromisoformat(s)
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def key(g):
    return f"{g['sport']}:{g['date']}:{g['away']}@{g['home']}"


def load(path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def locked_keys():
    if not LOCKS.exists():
        return set()
    with LOCKS.open(newline="") as f:
        return {r["key"] for r in csv.DictReader(f)}


def leaderboard():
    """Top 20 sports earners this month: [{rank, wallet, name, pnl}], or None when it can't be read."""
    d = KG.get(f"{DATA}/leaderboard", {"timePeriod": "MONTH", "orderBy": "PNL", "category": "SPORTS", "limit": TOP_N})
    rows = (d or {}).get("data") or []
    if len(rows) < TOP_N:
        return None
    return [{"rank": int(r["rank"]), "wallet": r["user_id"].lower(), "name": r.get("user_name") or "",
             "pnl": round(float(r.get("pnl") or 0))} for r in rows[:TOP_N]]


def kalshi_prices():
    """{(sport, date, away, home): Kalshi's moneyline row} from the Models page file (the app's own Kalshi read)."""
    out = {}
    for g in (load(MODELS, {}).get("games") or {}).values():
        k = (g.get("picks") or {}).get("kalshi")
        if k:
            out[(g.get("sport"), g.get("date"), g.get("away"), g.get("home"))] = k
    return out


def snapshot(pending, poly, board, now):
    """Refresh every game that hasn't started: its board, Polymarket's price and Kalshi's price, all from before the start."""
    kal = kalshi_prices()
    for g in poly.get("games") or []:
        start = parse_t(g.get("kickoff"))
        if not start or start <= now or g.get("listed_first") not in ("away", "home"):
            continue
        p = pending.setdefault(key(g), {})
        p.update({k: g[k] for k in ("sport", "date", "away", "home", "kickoff", "slug", "listed_first")})
        if g.get("away_bid") is not None and g.get("away_ask") is not None:
            p["poly_at"], p["poly_away_mid"] = poly.get("generated_at"), round((g["away_bid"] + g["away_ask"]) / 2, 4)
        k = kal.get((g["sport"], g["date"], g["away"], g["home"]))
        seen = parse_t((k or {}).get("seen"))
        if k and seen and seen < start:
            p["kalshi"] = {"seen": k["seen"], "away_ml": k.get("away_ml"), "home_ml": k.get("home_ml"), "home_wp": k.get("home_wp")}
        if board:
            p["board"] = {"at": iso(now), "top": board}


def moneyline(slug):
    """(condition id, outcome names) of the event's moneyline market, or None."""
    ev = KG.get(f"{GAMMA}/events", {"slug": slug}) or []
    for m in (ev[0].get("markets") or []) if ev else []:
        if m.get("sportsMarketType") == "moneyline" and m.get("conditionId"):
            return m["conditionId"].lower(), json.loads(m.get("outcomes") or "[]")
    return None


def trades(wallet, cids):
    """Every trade this wallet made on these markets, or None when the history couldn't be read in full."""
    out, cursor = [], None
    for _ in range(20):
        d = KG.get(f"{DATA}/trades", {"user": wallet, "condition": ",".join(sorted(cids)), "limit": 500, "cursor": cursor})
        if d is None or "data" not in d:
            return None
        out += d["data"]
        cursor = (d.get("pagination") or {}).get("next_cursor")
        if not (d.get("pagination") or {}).get("has_more") or not cursor:
            return out
    return None


def tally(game, cid, board, rows_by_wallet):
    """The locked numbers for one game from its traders' pre-start trades."""
    start = parse_t(game["kickoff"]).timestamp()
    first = game["listed_first"]
    side_of = {0: first, 1: "home" if first == "away" else "away"}
    traders, usd, n = [], {"away": 0.0, "home": 0.0}, {"away": 0, "home": 0}
    for t in board:
        money = {"away": 0.0, "home": 0.0}
        for x in rows_by_wallet.get(t["wallet"], []):
            if str(x.get("condition_id", "")).lower() != cid or float(x["timestamp"]) >= start:
                continue
            side = side_of.get(int(x.get("outcome_index", -1)))
            if side is None:
                continue
            v = float(x["size"]) * float(x["price"])
            money[side] += v if x.get("side") == "BUY" else -v
        if not (money["away"] or money["home"]):
            continue
        diff = money["away"] - money["home"]
        on = "away" if diff >= MIN_USD else "home" if -diff >= MIN_USD else ""
        if on:
            usd[on] += abs(diff)
            n[on] += 1
        traders.append({"rank": t["rank"], "name": t["name"], "wallet": t["wallet"], "pnl": t["pnl"],
                        "away": round(money["away"], 2), "home": round(money["home"], 2), "counted": on})
    sharp = "away" if usd["away"] > usd["home"] else "home" if usd["home"] > usd["away"] else ""
    heads = "away" if n["away"] > n["home"] else "home" if n["home"] > n["away"] else ""
    return {"n_away": n["away"], "n_home": n["home"], "usd_away": round(usd["away"], 2), "usd_home": round(usd["home"], 2),
            "sharp_side": sharp, "heads_side": heads, "traders": json.dumps(traders, separators=(",", ":"))}


def row(k, g, now, status, cid="", numbers=None):
    kal = g.get("kalshi") or {}
    r = {"locked_at": iso(now), "key": k, "sport": g["sport"], "date": g["date"], "away": g["away"], "home": g["home"],
         "kickoff": g["kickoff"], "slug": g["slug"], "condition_id": cid, "status": status,
         "board_at": (g.get("board") or {}).get("at", ""), "kalshi_seen": kal.get("seen", ""),
         "kalshi_away_ml": kal.get("away_ml", ""), "kalshi_home_ml": kal.get("home_ml", ""),
         "kalshi_home_wp": kal.get("home_wp", ""), "poly_at": g.get("poly_at", ""), "poly_away_mid": g.get("poly_away_mid", "")}
    r.update(numbers or {"n_away": "", "n_home": "", "usd_away": "", "usd_home": "", "sharp_side": "", "heads_side": "", "traders": ""})
    return {c: ("" if r.get(c) is None else r[c]) for c in COLUMNS}


def lock(pending, now):
    """Lock every started game; returns the new rows. A game whose data can't be read in full waits for the next run."""
    started = {k: g for k, g in pending.items() if parse_t(g["kickoff"]) <= now}
    out, cids = [], {}
    for k, g in sorted(started.items()):
        if now - parse_t(g["kickoff"]) > GIVE_UP:
            out.append(row(k, g, now, "missed"))
        elif not g.get("board"):
            out.append(row(k, g, now, "no_board"))      # never had a pre-start snapshot of the top 20
        else:
            ml = moneyline(g["slug"])
            if ml is None:
                continue                                 # retry next run (GIVE_UP ends it)
            cids[k] = ml[0]
    wallets = {t["wallet"] for k in cids for t in started[k]["board"]["top"]}
    history, failed = {}, False
    for w in sorted(wallets):
        mine = {cids[k] for k in cids if any(t["wallet"] == w for t in started[k]["board"]["top"])}
        rows = trades(w, mine)
        if rows is None:
            failed = True
            break
        history[w] = rows
    if not failed:
        for k, cid in cids.items():
            g = started[k]
            out.append(row(k, g, now, "locked", cid, tally(g, cid, g["board"]["top"], history)))
    for r in out:
        pending.pop(r["key"], None)
    return out


def main():
    now = datetime.now(timezone.utc)
    DIR.mkdir(parents=True, exist_ok=True)
    pending = load(PENDING, {})
    done = locked_keys()
    for k in [k for k in pending if k in done]:
        pending.pop(k)
    board = leaderboard()
    snapshot(pending, load(POLY, {}), board, now)
    for k in [k for k in pending if k in done]:
        pending.pop(k)
    new = lock(pending, now)
    write_header = not LOCKS.exists()
    with LOCKS.open("a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        if write_header:
            w.writeheader()
        w.writerows(new)
    PENDING.write_text(json.dumps(pending, separators=(",", ":"), sort_keys=True))
    print(f"board {'ok' if board else 'unreadable'}; pending {len(pending)}; locked {len(new)}: "
          + ", ".join(f"{r['key']} {r['status']} {r['sharp_side'] or '-'}" for r in new))
    for line in KG.log[-5:]:
        print("  " + line)


if __name__ == "__main__":
    main()
