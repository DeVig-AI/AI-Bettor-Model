#!/usr/bin/env python3
"""
live.py -- NFL Handicapper v2 live paper test, run every 3 hours (rules: HANDICAPPER_V2_LIVE_PREREG.md).
Paper only: no account, no key, no order is ever sent. Kalshi public market data and nflverse only.

Each run:
  1. Decide. For every game whose decision moment has come (early: 6 days to 4 days before kickoff; late: 1 day to
     2 hours before), once per game and line: our home chance from model_v2.json, Kalshi's market chance (average of
     the home mid and 1 - the away mid, usable when both bid-ask gaps are <= 0.05), edge = ours - market. If
     |edge| >= 0.04 we rest a paper limit order for one contract of our side at its yes bid, good until 40 minutes
     before kickoff. Every decision, bet or not, is appended to live/decisions.csv with its reasons.
  2. Grade. Once a game is settled: was the order filled (a later hourly candle traded or offered BELOW our price),
     the closing market chance (40 minutes before kickoff), CLV for the resting order (maker fee) and for buying at
     the ask instead (taker fee), and the result. Appended to live/grades.csv.
  3. Write live/THIS_WEEK.md (the pick card) and live/LIVE_RESULTS.md (running totals).
Run from the repo root (after hdata.py):  python3 nfl/handicapper/live.py
"""
import csv
import json
import math
import os
import sys
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, HERE)
import build_model_v2 as B2  # noqa: E402
import kalshi_history as KH  # noqa: E402
import qb as Q  # noqa: E402
import ratings as R  # noqa: E402

H = KH.H
LIVE = os.environ.get("HANDICAPPER_LIVE_DIR") or os.path.join(HERE, "live")      # override only for dry runs
DECISIONS = os.path.join(LIVE, "decisions.csv")
GRADES = os.path.join(LIVE, "grades.csv")
CARD = os.path.join(LIVE, "THIS_WEEK.md")
RESULTS = os.path.join(LIVE, "LIVE_RESULTS.md")
TEST_START = "2026-10-29T00:00:00Z"        # games kicking off from here on (the model was frozen before)
TEST_END = "2027-02-28T00:00:00Z"          # through the 2026 season's Super Bowl
MOMENTS = {"early": (timedelta(days=6), timedelta(days=4)), "late": (timedelta(days=1), timedelta(hours=2))}
THRESHOLD, MAX_SPREAD = 0.04, 0.05
MAKER, TAKER = 0.0175, 0.07
CLOSE = timedelta(minutes=40)
DEC_COLS = ["decided_utc", "game_id", "season", "week", "kickoff_utc", "line", "home_team", "away_team", "our_line",
            "our_p_home", "home_ticker", "away_ticker", "home_bid", "home_ask", "away_bid", "away_ask", "p_market",
            "usable", "edge", "side", "ticker", "limit_price", "taker_price", "reasons"]
GRADE_COLS = ["graded_utc", "game_id", "line", "side", "filled", "fill_utc", "limit_price", "taker_price",
              "close_p_home", "close_p_side", "clv_maker", "clv_taker", "won", "profit_maker", "profit_taker"]
STAMP = "%Y-%m-%dT%H:%M:%SZ"


def utc(s):
    return datetime.strptime(s, STAMP).replace(tzinfo=timezone.utc)


def read(path, cols):
    if not os.path.exists(path):
        with open(path, "w", newline="") as f:
            csv.writer(f).writerow(cols)
    return list(csv.DictReader(open(path)))


def append(path, rows, cols):
    with open(path, "a", newline="") as f:
        w = csv.writer(f)
        for r in rows:
            w.writerow([r.get(c, "") for c in cols])


# ---- our lines ------------------------------------------------------------------------------------------------------
def our_lines(model, games, team, qbg, av, game_ids):
    """{(game_id, line): dict(line, p, reasons)} for the games asked, ratings as of now (only finished games count)."""
    walk = R.Walk(games, team, **model["ratings"])
    q = model["qb"]
    qbw = Q.QBWalk(games, qbg, alpha=q["alpha"], carry=q["carry"], debut=q["debut"], league=q["league"])
    names = {}
    for side in ("home", "away"):
        names.update(dict(zip(games[f"{side}_qb_id"], games[f"{side}_qb_name"])))
    sub = games[games.game_id.isin(game_ids)]
    av_sub = av[av.game_id.isin(game_ids)]
    out = {}
    for name, spec in model["lines"].items():
        f = R.features(walk, sub, av_sub, pd.Timedelta(0)).merge(
            Q.features(qbw, sub, av_sub, pd.Timedelta(0), spec["injuries"]), on="game_id")
        c = R.cols(spec["groups"])
        b = np.array([spec["coef"][k] for k in c + ["const"]])
        line = R.predict(b, f[c].values)
        p = R.win_prob(line, spec["sigma"])
        for i, r in enumerate(f.itertuples()):
            out[(r.game_id, name)] = dict(line=float(line[i]), p=float(p[i]),
                                          reasons=reasons(r, spec, qbw, names, av_sub, name))
    return out


def reasons(r, spec, qbw, names, av, line):
    """Each part of the line in points for the home team, largest first."""
    coef = spec["coef"]
    part = lambda cs: sum(coef.get(k, 0.0) * getattr(r, k) for k in cs)
    bits = {"home field": coef.get("home", 0.0) * r.home + coef["const"],
            "team strength": part(["net_epa", "mov", "net_pass", "net_run", "mu_pass", "mu_run", "net_noto",
                                   "rest", "short_week", "travel"]),
            "QB": part(["qb", "qb_change"]), "injuries": part(["inj_qb", "inj_off", "inj_def"])}
    when = r.kick
    qbs = []
    for t in (r.away_team, r.home_team):
        out = spec["injuries"] and float(av[(av.game_id == r.game_id) & (av.team == t)].out_qb.sum()) >= Q.OUT_QB
        qid = None if out else qbw.last_starter(t, when)
        rating, _ = qbw.expected(t, r.season, when, out)
        qbs.append(f"{t} {names.get(qid, 'backup') if qid else 'backup'} ({rating:.0f})")
    txt = [f"{k} {v:+.1f}" for k, v in sorted(bits.items(), key=lambda kv: -abs(kv[1])) if abs(v) >= 0.05]
    return "; ".join(txt) + f" | QBs: {qbs[0]} at {qbs[1]}"


# ---- Kalshi ---------------------------------------------------------------------------------------------------------
def open_markets(games_by_key):
    """{game_id: {"home": market, "away": market}} for open Kalshi NFL moneyline events."""
    d = H.get(H.KALSHI + "/events", {"series_ticker": "KXNFLGAME", "status": "open", "with_nested_markets": "true",
                                     "limit": 200}) or {}
    out = {}
    for ev in d.get("events") or []:
        key = KH.match(ev.get("event_ticker") or "", ev.get("title"), games_by_key)
        if not key:
            continue
        gid = games_by_key[key]
        for m in ev.get("markets") or []:
            team = KH.KG.canon("NFL", m["ticker"].rsplit("-", 1)[-1])
            side = "home" if team == key[2] else "away" if team == key[1] else None
            if side:
                out.setdefault(gid, {})[side] = m
    return out


def price(m, k):
    return H.num(m.get(f"{k}_dollars")) if m else None


def decide(now, games, model, data):
    done = {(d["game_id"], d["line"]) for d in read(DECISIONS, DEC_COLS)}
    g = games[games.home_score.isna()].assign(kick=R.kickoffs(games[games.home_score.isna()]))
    due = []
    for r in g.itertuples():
        k = r.kick.to_pydatetime()
        if not (utc(TEST_START) <= k < utc(TEST_END)):
            continue
        for line, (start, stop) in MOMENTS.items():
            if (r.game_id, line) not in done and k - start <= now <= k - stop:
                due.append((r, line))
    if not due:
        return []
    by_key = {(r.gameday, r.away_team, r.home_team): r.game_id for r in g.itertuples()}
    mk = open_markets(by_key)
    ours = our_lines(model, games, *data, {r.game_id for r, _ in due})
    rows = []
    for r, line in due:
        m = mk.get(r.game_id, {})
        hb, ha, ab, aa = price(m.get("home"), "yes_bid"), price(m.get("home"), "yes_ask"), \
            price(m.get("away"), "yes_bid"), price(m.get("away"), "yes_ask")
        if None in (hb, ha, ab, aa):
            continue                                    # no market yet: try again next run (inside the window)
        o = ours[(r.game_id, line)]
        usable = (ha - hb) <= MAX_SPREAD + 1e-9 and (aa - ab) <= MAX_SPREAD + 1e-9
        p_mkt = ((hb + ha) / 2 + 1 - (ab + aa) / 2) / 2
        edge = o["p"] - p_mkt
        side = ("home" if edge > 0 else "away") if usable and abs(edge) >= THRESHOLD else "none"
        rows.append(dict(
            decided_utc=now.strftime(STAMP), game_id=r.game_id, season=r.season, week=r.week,
            kickoff_utc=r.kick.strftime(STAMP), line=line, home_team=r.home_team, away_team=r.away_team,
            our_line=round(o["line"], 2), our_p_home=round(o["p"], 4), home_ticker=m["home"]["ticker"],
            away_ticker=m["away"]["ticker"], home_bid=hb, home_ask=ha, away_bid=ab, away_ask=aa,
            p_market=round(p_mkt, 4), usable=usable, edge=round(edge, 4), side=side,
            ticker=m[side]["ticker"] if side != "none" else "",
            limit_price=(hb if side == "home" else ab) if side != "none" else "",
            taker_price=(ha if side == "home" else aa) if side != "none" else "", reasons=o["reasons"]))
    append(DECISIONS, rows, DEC_COLS)
    return rows


# ---- grading --------------------------------------------------------------------------------------------------------
def market_info(ticker):
    for path in ("/markets", "/historical/markets"):
        d = H.get(H.KALSHI + f"{path}/{ticker}")
        if d and d.get("market"):
            return d["market"]
    return {}


def low(c, key):
    v = c.get(key)
    if isinstance(v, dict):
        x = v.get("low_dollars") if v.get("low_dollars") not in (None, "") else v.get("low")
        return H.num(x) if x not in (None, "") else None
    return None


def close_mid(ticker, kick):
    end = kick - CLOSE
    cs = [c for c in KH.candles(ticker, int((end - timedelta(hours=12)).timestamp()), int(end.timestamp()))
          if c["end_period_ts"] <= end.timestamp()]
    if not cs:
        return None
    c = max(cs, key=lambda c: c["end_period_ts"])
    b, a = H.ohlc_close(c, "yes_bid"), H.ohlc_close(c, "yes_ask")
    return (b + a) / 2 if b is not None and a is not None else None


def grade(now):
    graded = {(g["game_id"], g["line"]) for g in read(GRADES, GRADE_COLS)}
    rows = []
    for d in read(DECISIONS, DEC_COLS):
        kick = utc(d["kickoff_utc"])
        if (d["game_id"], d["line"]) in graded or now < kick + timedelta(hours=5):
            continue
        home = market_info(d["home_ticker"])
        if home.get("result") not in ("yes", "no"):
            continue                                    # not settled yet
        ch, ca = close_mid(d["home_ticker"], kick), close_mid(d["away_ticker"], kick)
        if ch is None or ca is None:
            continue
        p_close = (ch + 1 - ca) / 2
        row = dict(graded_utc=now.strftime(STAMP), game_id=d["game_id"], line=d["line"], side=d["side"],
                   close_p_home=round(p_close, 4))
        if d["side"] != "none":
            lim, ask = float(d["limit_price"]), float(d["taker_price"])
            t0, end = utc(d["decided_utc"]), kick - CLOSE
            fill = None
            for c in sorted(KH.candles(d["ticker"], int(t0.timestamp()), int(end.timestamp())),
                            key=lambda c: c["end_period_ts"]):
                if not (t0.timestamp() < c["end_period_ts"] <= end.timestamp()):
                    continue
                tl, al = low(c, "price"), low(c, "yes_ask")
                if (tl is not None and tl < lim - 1e-9) or (al is not None and al < lim - 1e-9):
                    fill = datetime.fromtimestamp(c["end_period_ts"], timezone.utc).strftime(STAMP)
                    break
            side_close = p_close if d["side"] == "home" else 1 - p_close
            won = float((home["result"] == "yes") == (d["side"] == "home"))
            fm, ft = MAKER * lim * (1 - lim), TAKER * ask * (1 - ask)
            row.update(filled=fill is not None, fill_utc=fill or "", limit_price=lim, taker_price=ask,
                       close_p_side=round(side_close, 4), clv_maker=round(side_close - lim - fm, 4),
                       clv_taker=round(side_close - ask - ft, 4), won=won, profit_maker=round(won - lim - fm, 4),
                       profit_taker=round(won - ask - ft, 4))
        rows.append(row)
    append(GRADES, rows, GRADE_COLS)
    return rows


# ---- reports --------------------------------------------------------------------------------------------------------
def american(p):
    p = min(max(p, 0.01), 0.99)
    return f"{-100 * p / (1 - p):+.0f}" if p >= 0.5 else f"+{100 * (1 - p) / p:.0f}"


def write_card(now):
    ds = pd.DataFrame(read(DECISIONS, DEC_COLS))
    lines = ["# NFL Handicapper v2: this week's card", "",
             f"Updated {now.strftime(STAMP)}. Paper only: nothing is bet. Rules: `../HANDICAPPER_V2_LIVE_PREREG.md`.",
             "Lines are home-team points; a pick is a paper limit order at the price shown, good until 40 minutes "
             "before kickoff.", ""]
    if ds.empty:
        open(CARD, "w").write("\n".join(lines + ["No decisions yet."]) + "\n")
        return
    ds = ds[ds.kickoff_utc.map(utc) > now].sort_values(["kickoff_utc", "game_id", "line"])
    if ds.empty:
        lines.append("No upcoming games decided yet.")
    for r in ds.itertuples():
        mkt_line = R_line(float(r.p_market))
        if r.side == "none":
            pick = "no bet" if r.usable == "True" else "no bet (market too thin)"
        else:
            team = r.home_team if r.side == "home" else r.away_team
            pick = f"**{team} at {float(r.limit_price):.2f}** ({american(float(r.limit_price))})"
        lines += [f"### {r.away_team} at {r.home_team}, {r.kickoff_utc[:10]} ({r.line} line)",
                  f"- Ours: {by(r, float(r.our_line))}, {r.home_team} {float(r.our_p_home):.0%} to win. "
                  f"Kalshi: {r.home_team} {float(r.p_market):.0%} (about {by(r, mkt_line)}). "
                  f"Edge {float(r.edge):+.1%} for {r.home_team}.",
                  f"- Pick: {pick}", f"- Why: {r.reasons}", ""]
    open(CARD, "w").write("\n".join(lines) + "\n")


def by(r, line):
    return f"{r.home_team} by {line:.1f}" if line >= 0 else f"{r.away_team} by {-line:.1f}"


def R_line(p, sigma=13.1):
    p = min(max(p, 1e-4), 1 - 1e-4)
    return sigma * math.sqrt(2) * erfinv(2 * p - 1)


def erfinv(y):
    a = 0.147                                          # Winitzki's approximation, plenty for a display number
    ln = math.log(1 - y * y)
    t = 2 / (math.pi * a) + ln / 2
    return math.copysign(math.sqrt(math.sqrt(t * t - ln / a) - t), y)


def write_results(now):
    gs = pd.DataFrame(read(GRADES, GRADE_COLS))
    out = ["# NFL Handicapper v2: live paper test results", "",
           f"Updated {now.strftime(STAMP)}. Rules: `../HANDICAPPER_V2_LIVE_PREREG.md`. Per $1 contract, fees included. "
           "The pass/fail verdict is read once, after the 2026 season's last game; until then these are running totals.", ""]
    if gs.empty or (gs.side != "none").sum() == 0:
        open(RESULTS, "w").write("\n".join(out + ["No graded bets yet."]) + "\n")
        return
    for line in ("early", "late"):
        b = gs[(gs.line == line) & (gs.side != "none")].copy()
        if b.empty:
            continue
        for c in ("clv_maker", "clv_taker", "profit_maker", "profit_taker", "limit_price", "taker_price", "won"):
            b[c] = b[c].astype(float)
        f = b[b.filled == "True"]
        t = lambda x: x.mean() / (x.std(ddof=1) / math.sqrt(len(x))) if len(x) > 1 and x.std(ddof=1) > 0 else float("nan")
        out += [f"## {line} line", "",
                f"- Orders: {len(b)}; filled: {len(f)} ({len(f) / len(b):.0%})",
                f"- Filled limit orders: mean CLV {f.clv_maker.mean():+.4f} (t {t(f.clv_maker):.2f}); "
                f"won {f.won.mean():.0%}; profit {f.profit_maker.sum():+.2f} on {f.limit_price.sum():.2f} staked"
                if len(f) else "- Filled limit orders: none yet",
                f"- Unfilled orders' would-be CLV: {b[b.filled != 'True'].clv_maker.mean():+.4f}",
                f"- Buying at the ask instead: mean CLV {b.clv_taker.mean():+.4f} (t {t(b.clv_taker):.2f}); "
                f"profit {b.profit_taker.sum():+.2f} on {b.taker_price.sum():.2f} staked", ""]
    open(RESULTS, "w").write("\n".join(out) + "\n")


def main():
    os.makedirs(LIVE, exist_ok=True)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    model = json.load(open(os.path.join(HERE, "model_v2.json")))
    games, team, qbg, av = B2.load()
    made = decide(now, games, model, (team, qbg, av))
    graded = grade(now)
    write_card(now)
    write_results(now)
    print(f"{now.strftime(STAMP)}: {len(made)} decisions ({sum(r['side'] != 'none' for r in made)} bets), "
          f"{len(graded)} graded; Kalshi errors: {H.log[:3]}")


if __name__ == "__main__":
    main()
