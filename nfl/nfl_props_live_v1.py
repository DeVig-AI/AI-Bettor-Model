#!/usr/bin/env python3
"""
nfl_props_live_v1.py -- live game-day view of the NFL props paper test: scores, each locked paper pick's stat so far,
Kalshi's current price for that pick, and Kalshi's live game odds (moneyline, main spread and total) for games not yet
final, plus a win-chance line (Kalshi price history) for games under way. Writes nfl/live/props_live.json for the app (live game cards on Home) and the app's Home game cards.

Display only. It never changes a pick, a lock or a grade: official grading stays in nfl/nfl_props_model_v1_live.py
(from nflverse play-by-play). Live stats here come from ESPN's public box score and are unofficial.
Read-only public data, no keys, nothing bet.

Runs every 5 minutes from GitHub Actions; does nothing outside game windows unless FORCE=1.
"""
import json, math, os, re, sys, time, unicodedata, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(HERE, "props_model_export.json")
PRICES = os.path.join(HERE, "props_exchanges_export.json")
OUT = os.path.join(HERE, "live", "props_live.json")
# Finished games are also kept here for good (the live file only holds the current week), so the app's History can
# show how each day's prop picks did. Display only: official grading still happens from play-by-play.
ARCHIVE = os.path.join(HERE, "live", "props_results.json")
# Each game's main prop lines (every priced player and stat, picked or not), saved before kickoff because Kalshi closes
# the markets once the game starts. The archive copies them, so History can show how every prop ended, not just picks.
LINES = os.path.join(HERE, "live", "props_lines.json")
BOX_STATS = ("passing_yards", "passing_tds", "passing_completions", "passing_attempts", "interceptions", "rushing_yards",
             "rushing_attempts", "receptions", "receiving_yards", "rush_rec_yards", "touchdowns")   # what box_stats() reads
ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl"
KALSHI = "https://api.elections.kalshi.com/trade-api/v2"
UA = "nfl-props-live/1.0 (personal research; read-only)"
ET = ZoneInfo("America/New_York")
ESPN_ABBR = {"WSH": "WAS", "LAR": "LA", "JAC": "JAX"}
sys.path.insert(0, os.path.dirname(HERE))
import kalshi_games_v1 as KG  # noqa: E402  live game odds (moneyline / spread / total), keyless
WINDOW_BEFORE, WINDOW_AFTER = timedelta(minutes=30), timedelta(hours=5)
log = []


def get(url, params=None, tries=3):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429 and i < tries - 1:
                time.sleep(2 ** (i + 1)); continue
            log.append(f"HTTP {e.code} {url[:160]}"); return None
        except Exception as e:
            if i < tries - 1:
                time.sleep(1 + i); continue
            log.append(f"ERR {type(e).__name__} {url[:160]}"); return None


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z ]", "", s.replace("-", " ").replace(".", ""))
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def fnum(x):
    try:
        v = float(x)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def parse_t(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00")).astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def abbr(a):
    a = str(a or "").upper()
    return ESPN_ABBR.get(a, a)


def scoreboard():
    """{(ET date, away, home): game} from ESPN's current-week scoreboard."""
    d = get(f"{ESPN}/scoreboard") or {}
    out = {}
    for ev in d.get("events") or []:
        comp = (ev.get("competitions") or [{}])[0]
        teams = {c.get("homeAway"): c for c in comp.get("competitors") or []}
        a, h = teams.get("away"), teams.get("home")
        t = parse_t(ev.get("date"))
        if not (a and h and t):
            continue
        st = (ev.get("status") or comp.get("status") or {})
        ty = st.get("type") or {}
        g = {"espn_id": ev.get("id"), "kickoff": iso(t),
             "away": abbr((a.get("team") or {}).get("abbreviation")), "home": abbr((h.get("team") or {}).get("abbreviation")),
             "away_score": fnum(a.get("score")), "home_score": fnum(h.get("score")),
             "state": ty.get("state") or "pre",            # pre | in | post
             "detail": ty.get("shortDetail") or ty.get("detail") or ""}
        pos_id = (comp.get("situation") or {}).get("possession")
        g["possession"] = next((abbr(c["team"].get("abbreviation")) for c in (a, h)
                                if pos_id and (c.get("team") or {}).get("id") == pos_id), None)
        out[(t.astimezone(ET).date().isoformat(), g["away"], g["home"])] = g
    return out


def box_stats(espn_id):
    """{(team, normalized name): {stat: value}} from ESPN's box score; unofficial, display only."""
    d = get(f"{ESPN}/summary", {"event": espn_id}) or {}
    out = {}
    for tm in (d.get("boxscore") or {}).get("players") or []:
        team = abbr((tm.get("team") or {}).get("abbreviation"))
        for grp in tm.get("statistics") or []:
            keys, name = grp.get("keys") or [], grp.get("name")
            for a in grp.get("athletes") or []:
                vals = dict(zip(keys, a.get("stats") or []))
                s = out.setdefault((team, norm((a.get("athlete") or {}).get("displayName"))), {})
                if name == "passing":
                    ca = str(vals.get("completions/passingAttempts", "")).split("/")
                    if len(ca) == 2:
                        s["passing_completions"], s["passing_attempts"] = fnum(ca[0]), fnum(ca[1])
                    s["passing_yards"] = fnum(vals.get("passingYards"))
                    s["passing_tds"] = fnum(vals.get("passingTouchdowns"))
                    s["interceptions"] = fnum(vals.get("interceptions"))
                elif name == "rushing":
                    s["rushing_attempts"] = fnum(vals.get("rushingAttempts"))
                    s["rushing_yards"] = fnum(vals.get("rushingYards"))
                    s["_rush_td"] = fnum(vals.get("rushingTouchdowns"))
                elif name == "receiving":
                    s["receptions"] = fnum(vals.get("receptions"))
                    s["receiving_yards"] = fnum(vals.get("receivingYards"))
                    s["_rec_td"] = fnum(vals.get("receivingTouchdowns"))
    for s in out.values():
        s["rush_rec_yards"] = (s.get("rushing_yards") or 0) + (s.get("receiving_yards") or 0)
        s["touchdowns"] = (s.pop("_rush_td", None) or 0) + (s.pop("_rec_td", None) or 0)
    return out


def kalshi_now(ticker):
    m = (get(f"{KALSHI}/markets/{urllib.parse.quote(ticker)}") or {}).get("market") or {}
    bid, ask = fnum(m.get("yes_bid_dollars")), fnum(m.get("yes_ask_dollars"))
    return {"bid": bid, "ask": ask, "last": fnum(m.get("last_price_dollars")), "status": m.get("status"),
            "mid": round((bid + ask) / 2, 4) if bid is not None and ask is not None else None}


def pick_state(side, line, cur, game_state):
    """Live read of one pick from the stat so far. Over can only be won early; Under can only be lost early."""
    if game_state == "pre" or cur is None:
        return "pending", None
    top = math.floor(line)                         # Over N-0.5 needs N; Under N-0.5 survives up to N-1
    if side == "OVER":
        if cur > line:
            return "won", 0.0
        return ("lost" if game_state == "post" else "live"), round(top + 1 - cur, 1)   # still needed
    if cur > line:
        return "lost", 0.0
    return ("won" if game_state == "post" else "live"), round(top - cur, 1)            # room left


def public(o):
    return {k: v for k, v in o.items() if not k.startswith("_")} if o else None


def live_game_odds():
    """{(away, home): {moneyline, spread, total}} from Kalshi's open NFL game markets, as fee-included American odds."""
    out = {}
    try:
        games = KG.kalshi_games("NFL")
    except Exception as e:                         # display only: a Kalshi hiccup must not stop the scores
        log.append(f"kalshi game odds: {type(e).__name__}: {e}")
        return out
    for g in games.values():
        a, h = g["away_code"], g["home_code"]
        ml = KG.moneylines(g, a, h)
        sp, tot = KG.main_spread(g, a, h), KG.main_total(g)
        out[(KG.canon("NFL", a), KG.canon("NFL", h))] = {
            "_home_ticker": g["teams"][h].get("ticker"),
            "moneyline": {"home": ml[0], "away": ml[1]} if None not in ml else None,
            "spread": {"home_point": sp[0], "home": sp[1], "away": sp[2]} if sp and None not in sp else None,
            "total": {"line": tot[0], "over": tot[1], "under": tot[2]} if tot and None not in tot else None}
    log.extend(KG.log[:10])
    return out


def _close(c, key):
    """A candle's closing value in dollars; Kalshi sends {close_dollars} or whole-cent {close}."""
    v = c.get(key)
    if isinstance(v, dict):
        if v.get("close_dollars") not in (None, ""):
            return fnum(v["close_dollars"])
        x = fnum(v.get("close"))
        return x / 100.0 if x is not None and x > 1 else x
    return fnum(c.get(key + "_close_dollars"))


def win_line(ticker, kickoff, now, max_points=150):
    """[[unix_ts, home win chance]] from 2 hours before kickoff to now (1-minute candles, bid/ask midpoint)."""
    if not ticker or not kickoff:
        return None
    start = int((kickoff - timedelta(hours=2)).timestamp())
    d = get(f"{KALSHI}/series/KXNFLGAME/markets/{urllib.parse.quote(ticker)}/candlesticks",
            {"start_ts": start, "end_ts": int(now.timestamp()), "period_interval": 1}) or {}
    pts = []
    for c in d.get("candlesticks") or []:
        b, a = _close(c, "yes_bid"), _close(c, "yes_ask")
        v = (b + a) / 2 if b is not None and a is not None and 0 < b <= a < 1 else _close(c, "price")
        if v is not None and 0 <= v <= 1 and c.get("end_period_ts"):
            pts.append([int(c["end_period_ts"]), round(v, 3)])
    if len(pts) > max_points:                      # keep the shape, drop the bulk; always keep the latest point
        step = len(pts) / max_points
        pts = [pts[int(i * step)] for i in range(max_points - 1)] + [pts[-1]]
    return pts or None


def main_lines(rows):
    """[[player, stat, line, Kalshi over chance]]: per player and stat, the line Kalshi priced closest to 50-50."""
    best = {}
    for r in rows:
        mid = r.get("k_mid")
        if (r.get("stat") not in BOX_STATS or mid is None or r.get("line") is None or not r.get("player")
                or "D/ST" in r["player"]):                 # a defense has no box score line
            continue
        k = (r["player"], r["stat"])
        if k not in best or abs(mid - 0.5) < abs(best[k][3] - 0.5):
            best[k] = [r["player"], r["stat"], r["line"], round(float(mid), 3)]
    return sorted(best.values(), key=lambda x: (BOX_STATS.index(x[1]), x[0]))


def save_lines(games, live_state):
    """Keep each game's main lines from its last pre-game run (later runs only see the markets that are still open)."""
    try:
        saved = json.load(open(LINES))
    except Exception:
        saved = {"games": {}}
    sv, changed = saved.setdefault("games", {}), False
    for g in games:
        ln = main_lines(g.get("rows") or [])
        if ln and live_state.get(g["game_key"], "pre") == "pre" and ln != sv.get(g["game_key"], {}).get("lines"):
            sv[g["game_key"]] = {"kickoff": g.get("kickoff_time"), "lines": ln}
            changed = True
    cutoff = iso(datetime.now(timezone.utc) - timedelta(days=21))
    for k in [k for k, v in sv.items() if (v.get("kickoff") or "") < cutoff]:   # the archive keeps them after that
        del sv[k]
        changed = True
    if changed:
        os.makedirs(os.path.dirname(LINES), exist_ok=True)
        with open(LINES, "w") as f:
            json.dump(saved, f, separators=(",", ":"), allow_nan=False)
    return sv


def archive_finished(out_games, saved_lines=None):
    """Add every finished game with prop picks or player stats to ARCHIVE (kept across weeks), with its main lines."""
    try:
        arch = json.load(open(ARCHIVE))
    except Exception:
        arch = {"games": {}}
    games = arch.setdefault("games", {})
    added = 0
    for g in out_games:
        if g.get("state") != "post" or not (g.get("picks") or g.get("stats")):
            continue
        games[g["game_key"]] = {
            "kickoff": g.get("kickoff"), "away": g["away"], "home": g["home"],
            "away_score": g.get("away_score"), "home_score": g.get("home_score"),
            "picks": [{k: p.get(k) for k in ("player", "stat", "line", "side", "price", "model_p", "current", "status")}
                      for p in g.get("picks") or []],
            "stats": g.get("stats"), "kalshi_line": g.get("kalshi_line"), "espn_id": g.get("espn_id"),
            "lines": ((saved_lines or {}).get(g["game_key"]) or {}).get("lines") or (games.get(g["game_key"]) or {}).get("lines")}
        added += 1
    if added:
        arch["updated"] = iso(datetime.now(timezone.utc))
        with open(ARCHIVE, "w") as f:
            json.dump(arch, f, separators=(",", ":"), allow_nan=False)


def main():
    now = datetime.now(timezone.utc)
    model = json.load(open(MODEL))
    games = [d["data"] for d in model.get("docs", []) if d.get("collection") == "props_model"]
    report = next((d["data"] for d in model.get("docs", []) if d.get("collection") == "props_model_report"), {})
    kicks = [parse_t(g.get("kickoff_time")) for g in games]
    active = any(k and k - WINDOW_BEFORE <= now <= k + WINDOW_AFTER for k in kicks)
    if not active and os.getenv("FORCE") != "1" and os.path.exists(OUT):
        print("no game window now; nothing to do"); return 0
    sb = scoreboard()
    odds = live_game_odds()
    out_games, n_picks = [], 0
    saved_lines = save_lines(games, {g["game_key"]: (sb.get((g["game_date"], g["away_team"], g["home_team"])) or {}).get("state", "pre")
                                     for g in games})
    try:                                           # keep a finished game's line after Kalshi closes its market
        prev_lines = {g["game_key"]: g.get("kalshi_line") for g in json.load(open(OUT)).get("games", [])}
    except Exception:
        prev_lines = {}

    def line_for(key, away, home, state, kickoff):
        kg = odds.get((away, home)) or {}
        if state == "in":
            pts = win_line(kg.get("_home_ticker"), parse_t(kickoff), now)
            if pts:
                return {"team": home, "points": pts}
        return prev_lines.get(key) if state in ("in", "post") else None

    for g in sorted(games, key=lambda x: (x.get("kickoff_time") or "", x["game_key"])):
        live = sb.get((g["game_date"], g["away_team"], g["home_team"])) or {}
        picks = g.get("paper_picks") or []
        tick = {(r["player"], r["stat"], r["line"]): (r.get("k") or {}).get("t") for r in g.get("rows") or []}
        rows = g.get("rows") or []
        box = box_stats(live["espn_id"]) if (picks or rows or saved_lines.get(g["game_key"])) and live.get("state") in ("in", "post") and live.get("espn_id") else {}
        out_picks = []
        for p in picks:
            st = {}
            for t in (g["away_team"], g["home_team"]):
                st = box.get((t, norm(p["player"]))) or st
            state = live.get("state", "pre")
            # no box score (pre-game or ESPN failed) -> unknown; in the box score but no line for this stat -> 0
            cur = ((st.get(p["stat"]) or 0.0) if box else None) if state in ("in", "post") else None
            ps, need = pick_state(p["side"], p["line"], cur, state)
            t = tick.get((p["player"], p["stat"], p["line"]))
            out_picks.append(dict(p, ticker=t, current=cur, status=ps, to_go=need,
                                  kalshi_now=kalshi_now(t) if t and state != "post" else None))
        # every priced player's stat so far (the open markets plus the lines saved before kickoff), so the app can
        # follow any prop someone tracks and History can show how every prop ended, not just the locked picks
        stats = {}
        if box:
            for r in rows + [{"player": x[0], "stat": x[1]} for x in (saved_lines.get(g["game_key"]) or {}).get("lines") or []]:
                st = {}
                for t in (g["away_team"], g["home_team"]):
                    st = box.get((t, norm(r["player"]))) or st
                stats.setdefault(r["player"], {})[r["stat"]] = st.get(r["stat"]) or 0.0
        n_picks += len(out_picks)
        out_games.append({"game_key": g["game_key"], "away": g["away_team"], "home": g["home_team"],
                          "kickoff": g.get("kickoff_time"), "locked": bool(g.get("locked")),
                          "state": live.get("state", "pre"), "detail": live.get("detail", ""),
                          "away_score": live.get("away_score"), "home_score": live.get("home_score"),
                          "possession": live.get("possession") or None, "espn_id": live.get("espn_id"),
                          "kalshi_game": public(odds.get((g["away_team"], g["home_team"]))) if live.get("state") != "post" else None,
                          "kalshi_line": line_for(g["game_key"], g["away_team"], g["home_team"], live.get("state", "pre"), g.get("kickoff_time")),
                          "picks": out_picks, "stats": stats or None})
    # games on ESPN's board with no prop prices still get a score line
    known = {(g["game_date"], g["away_team"], g["home_team"]) for g in games}
    for k, v in sorted(sb.items(), key=lambda kv: kv[1]["kickoff"]):
        if k not in known:
            out_games.append({"game_key": f"{k[0]}_{k[1]}_{k[2]}", "away": v["away"], "home": v["home"],
                              "kickoff": v["kickoff"], "locked": False, "state": v["state"], "detail": v["detail"],
                              "away_score": v["away_score"], "home_score": v["home_score"],
                              "possession": v.get("possession") or None, "espn_id": v["espn_id"],
                              "kalshi_game": public(odds.get((v["away"], v["home"]))) if v["state"] != "post" else None,
                              "kalshi_line": line_for(f"{k[0]}_{k[1]}_{k[2]}", v["away"], v["home"], v["state"], v["kickoff"]),
                              "picks": []})
    out = {"generated_at": iso(now), "model_scored_utc": model.get("generated_at"), "active": active,
           "note": "Live stats are ESPN's unofficial box score. Official grading uses nflverse play-by-play after the game.",
           "report": {k: report.get(k) for k in ("paper_picks_graded", "wins", "profit_per_1_contract_sum", "cost_sum", "roi")},
           "n_picks": n_picks, "errors": log[:30], "games": out_games}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    archive_finished(out_games, saved_lines)
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"), allow_nan=False)
    print(json.dumps({k: v for k, v in out.items() if k != "games"}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
