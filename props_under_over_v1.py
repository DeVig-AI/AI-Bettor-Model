#!/usr/bin/env python3
"""
props_under_over_v1.py -- PROPS_UNDER_OVER_V1 (see PROPS_UNDER_OVER_V1_PREREG.md). Paper only, read-only.

Before EVAL_AFTER it prints only how many games / rungs are in the window. On or after it, it evaluates once and
writes PROPS_UNDER_OVER_V1_RESULT.json / .md; once those exist it does nothing.
Run from the repo root:  python3 props_under_over_v1.py
"""
import json, os, random, sqlite3, sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
DBS = {"NBA": "nba/NBA_PROPS_MODEL_V2_LOG.sqlite3", "NHL": "nhl/NHL_PROPS_MODEL_V1_LOG.sqlite3"}
START, END = "2026-11-04T00:00:00Z", "2027-02-01T00:00:00Z"
EVAL_AFTER = datetime(2027, 2, 3, tzinfo=timezone.utc)
MAX_SPREAD, MIN_GAMES, DRAWS, SEED = 0.06, 300, 10000, 20261103
OUT_JSON = os.path.join(ROOT, "PROPS_UNDER_OVER_V1_RESULT.json")
OUT_MD = os.path.join(ROOT, "PROPS_UNDER_OVER_V1_RESULT.md")


def fee(p):
    return 0.07 * p * (1 - p)


def rows(with_results):
    out = []
    for sport, rel in DBS.items():
        con = sqlite3.connect(f"file:{os.path.join(ROOT, rel)}?mode=ro", uri=True)
        q = """select r.game_key, r.ticker, r.k_bid, r.k_ask, g.result from locked_rows r
               join locked_games lg on lg.game_key = r.game_key
               left join grades g on g.ticker = r.ticker
               where lg.kickoff_utc >= ? and lg.kickoff_utc < ?"""
        for game, ticker, b, a, res in con.execute(q, (START, END)):
            if b is None or a is None or not (0 < b <= a < 1) or a - b > MAX_SPREAD:
                continue
            if with_results and res not in ("yes", "no"):
                continue
            r = {"sport": sport, "game": f"{sport}|{game}", "bid": b, "ask": a}
            if with_results:
                y = 1.0 if res == "yes" else 0.0
                over = a + fee(a) - y
                under = (1 - b) + fee(1 - b) - (1 - y)
                r.update(over=over, under=under, d=over - under)
            out.append(r)
        con.close()
    return out


def boot(rs, key, rng_seed=SEED):
    """mean of key over rungs, 95% percentile interval resampling whole games"""
    by = {}
    for r in rs:
        s = by.setdefault(r["game"], [0.0, 0])
        s[0] += r[key]; s[1] += 1
    games = list(by.values())
    tot = sum(g[0] for g in games) / sum(g[1] for g in games)
    rng = random.Random(rng_seed)
    n, ms = len(games), []
    for _ in range(DRAWS):
        sx = sn = 0
        for _ in range(n):
            g = games[rng.randrange(n)]
            sx += g[0]; sn += g[1]
        ms.append(sx / sn)
    ms.sort()
    return {"mean": round(tot, 5), "lo": round(ms[int(0.025 * DRAWS)], 5), "hi": round(ms[int(0.975 * DRAWS) - 1], 5),
            "games": n, "rungs": len(rs)}


def main():
    now = datetime.now(timezone.utc)
    if os.path.exists(OUT_JSON):
        print("already evaluated:", OUT_JSON); return
    if now < EVAL_AFTER:
        rs = rows(False)
        print(f"waiting until {EVAL_AFTER:%Y-%m-%d}: {len({r['game'] for r in rs})} games, {len(rs)} rungs in the window so far "
              "(no results are read before then)")
        return
    rs = rows(True)
    games = len({r["game"] for r in rs})
    res = {"test": "PROPS_UNDER_OVER_V1", "evaluated_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "window": [START, END],
           "games": games, "rungs": len(rs)}
    if games < MIN_GAMES:
        res["decision"] = "TOO FEW GAMES"
    else:
        D = boot(rs, "d")
        res["D"] = D
        res["decision"] = "UNDERS LOST LESS" if D["lo"] > 0 else "OVERS LOST LESS" if D["hi"] < 0 else "NO CLEAR GAP"
        res["reported"] = {"over_loss": boot(rs, "over"), "under_loss": boot(rs, "under"),
                           "by_sport": {s: boot([r for r in rs if r["sport"] == s], "d") for s in DBS
                                        if any(r["sport"] == s for r in rs)}}
    with open(OUT_JSON, "w") as fh:
        json.dump(res, fh, indent=1)
    c = lambda x: f"{x * 100:+.2f}¢"
    md = [f"# PROPS_UNDER_OVER_V1 — result: **{res['decision']}**", "",
          f"Evaluated {res['evaluated_utc']}; games {START[:10]} to {END[:10]} (end excluded); {games} games, {len(rs)} rungs.", ""]
    if "D" in res:
        D = res["D"]
        md += [f"- D (Over loss − Under loss per $1 contract): {c(D['mean'])}, 95% {c(D['lo'])} to {c(D['hi'])}"]
        for k, v in res["reported"].items():
            if k == "by_sport":
                md += [f"- D, {s}: {c(x['mean'])} ({c(x['lo'])} to {c(x['hi'])}), {x['games']} games" for s, x in v.items()]
            else:
                md += [f"- {k.replace('_', ' ')}: {c(v['mean'])} ({c(v['lo'])} to {c(v['hi'])})"]
    md += ["", "Paper only. Not a claim of beating Kalshi."]
    with open(OUT_MD, "w") as fh:
        fh.write("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    sys.exit(main())
