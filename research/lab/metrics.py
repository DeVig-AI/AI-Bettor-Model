"""Constitution A4-A6: pricing, the edge-beyond-the-line effect with its game bootstrap, and Holm's correction."""
import math

import numpy as np

from . import config as C


def phi(z):
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def baseline_side(r_train):
    """s0: the line-only baseline's side, sign of the training-period mean cover margin (+1 if exactly 0)."""
    m = float(np.mean(r_train)) if len(r_train) else 0.0
    return -1.0 if m < 0 else 1.0


def effect_parts(d, r, s0):
    """Per-game contribution (s_i - s0) * r_i; its mean is the effect E (A5)."""
    return (np.sign(d) - s0) * r


def bootstrap(v, n=C.BOOT_N, seed=C.BOOT_SEED, chunk=500):
    """Bootstrap means of v (10,000 game resamples, fixed seed: identical indices for every candidate)."""
    v = np.asarray(v, dtype=float)
    rng = np.random.default_rng(seed)
    out = np.empty(n)
    for i in range(0, n, chunk):
        k = min(chunk, n - i)
        idx = rng.integers(0, len(v), size=(k, len(v)), dtype=np.int32)
        out[i:i + k] = v[idx].mean(axis=1)
    return out


def picks(d, r, price=None):
    """Pick record at closing-line 50/50 + Kalshi fee (A4): every game where the model differs from the line.
    price: the home side's vig-free closing price per game (moneylines, Part D3); a pick then costs its side's price
    plus the fee, and break-even is the picks' average cost."""
    s = np.sign(d)
    take = (s != 0) & (r != 0)                          # model equals line: no pick; push: no bet
    win = (s * r > 0) & take
    n, w = int(take.sum()), int(win.sum())
    if price is None:
        cost = np.full(len(s), C.COST)
    else:
        q = np.where(s > 0, np.asarray(price, dtype=float), 1 - np.asarray(price, dtype=float))
        cost = q + C.FEE_RATE * q * (1 - q)
    staked = float(cost[take].sum())
    profit = float((1 - cost[win]).sum() - cost[take & ~win].sum())
    return {"picks": n, "wins": w, "losses": n - w, "pushes": int(((s != 0) & (r == 0)).sum()),
            "win_rate": round(w / n, 4) if n else None,
            "break_even": round(float(cost[take].mean()) if price is not None and n else C.COST, 4),
            "roi": round(profit / staked, 4) if n else None}


def evaluate(d, r, s0, with_ci=True, price=None):
    d, r = np.asarray(d, dtype=float), np.asarray(r, dtype=float)
    n = len(r)
    if n == 0:
        return {"games": 0, "effect": None, "ci": None, "se": None, "p": None}
    v = effect_parts(d, r, s0)
    e = float(v.mean())
    out = {"games": n, "effect": round(e, 4)}
    if with_ci:
        b = bootstrap(v)
        se = float(b.std(ddof=1))
        out.update(ci=[round(float(np.percentile(b, 2.5)), 4), round(float(np.percentile(b, 97.5)), 4)],
                   se=round(se, 4), p=round(1 - phi(e / se), 6) if se > 0 else (0.0 if e > 0 else 1.0))
    sd = d.std()
    out["slope"] = round(float(np.polyfit(d, r, 1)[0]), 4) if n > 2 and sd > 0 else None
    out["pick_share"] = round(float((np.sign(d) != 0).mean()), 4)
    out["kalshi"] = picks(d, r, price)
    return out


def holm(pvals):
    """Holm-Bonferroni adjusted p-values, same order as given."""
    p = np.asarray([1.0 if x is None or (isinstance(x, float) and math.isnan(x)) else float(x) for x in pvals])
    m = len(p)
    order = np.argsort(p, kind="stable")
    adj = np.empty(m)
    run = 0.0
    for rank, i in enumerate(order):
        run = max(run, min(1.0, (m - rank) * p[i]))
        adj[i] = run
    return [round(float(x), 6) for x in adj]
