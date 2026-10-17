"""The testing chamber: one place to run a candidate signal, judged by the fixed pass bar.

    ch = Chamber.from_cache()
    ch.evaluate(SINGLE["momentum"])     # train + validation, base and stress costs, report
    ch.vault_test(SINGLE["momentum"])   # only if validation passed; once; final

Data after a split's end is cut off before anything sees it. Every run is counted.
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import pandas as pd

from ..config import PASS_BAR_PATH, ROOT, file_sha256, load_constitution, load_pass_bar
from ..data import membership
from ..data.store import CACHE, has_table, read_table
from ..portfolio import apply_limits, equal_weight, top_fraction
from ..signals import SIGNALS, Panel
from . import engine
from . import metrics as M
from .registry import Registry, VaultLocked

REPORTS = ROOT / "reports" / "chamber"
UNKNOWN = "Unknown"
PERIOD_COVERAGE = 0.8
BENCH_CACHE = CACHE / "benchmarks"


@dataclass(frozen=True)
class Candidate:
    name: str
    score: Callable                 # (panel, members, skipped) -> Series
    reason: str                     # why this should work, written before testing
    kind: str = "signal"            # "signal" or "combination"


SINGLE = {
    "momentum": Candidate("momentum", SIGNALS["momentum"], "winners keep winning for months (Jegadeesh-Titman)"),
    "value": Candidate("value", SIGNALS["value"], "cheap stocks earn a premium (Fama-French HML, E/P)"),
    "insider": Candidate("insider", SIGNALS["insider"], "insiders buy with their own money when they know"),
    "low_vol": Candidate("low_vol", SIGNALS["low_vol"], "calm stocks beat risky ones risk-adjusted (Baker et al.)"),
}


def combine(name: str, reason: str, *parts: Candidate) -> Candidate:
    """Average of the parts' percentile ranks. Only stocks every part scores are kept."""
    if not reason.strip():
        raise ValueError("every combination needs a written reason")

    def score(p, members, skipped):
        ranks = [c.score(p, members, skipped).rank(pct=True) for c in parts]
        return pd.concat(ranks, axis=1, join="inner").mean(axis=1)
    return Candidate(name, score, reason, kind="combination")


def month_ends(index: pd.DatetimeIndex, start, end) -> list[pd.Timestamp]:
    """Last trading day of each month in [start, end], plus the trading day just before start."""
    idx = index[(index >= pd.Timestamp(start)) & (index <= pd.Timestamp(end))]
    ends = list(pd.Series(idx, index=idx).groupby([idx.year, idx.month]).max())
    before = index[index < pd.Timestamp(start)]
    return ([before[-1]] if len(before) else []) + ends[:-1]  # last month-end's trade would fall outside


class Chamber:
    def __init__(self, prices: pd.DataFrame, profiles: pd.DataFrame, fundamentals: pd.DataFrame | None = None,
                 insider: pd.DataFrame | None = None, exclusions: pd.DataFrame | None = None,
                 member_table: pd.DataFrame | None = None, registry: Registry | None = None,
                 synthetic: bool = False, reports: Path = REPORTS, now: datetime | None = None):
        self.pb = load_pass_bar()
        self.L = load_constitution().limits
        self.prices = prices
        # Sector from SEC SIC codes. Unknown sector (often old delisted names with no CIK on
        # file) is its own bucket under the 25% cap: dropping them would bias toward survivors.
        self.sectors = {s: (sec or UNKNOWN) for s, sec in zip(profiles["symbol"], profiles["sector"])}
        self.fund = fundamentals if fundamentals is not None else pd.DataFrame()
        self.ins = insider if insider is not None else pd.DataFrame()
        self.excl = exclusions if exclusions is not None else pd.DataFrame(columns=["symbol", "start", "end", "reason"])
        self.members = member_table
        self.reg = registry or Registry()
        self.synthetic = synthetic
        self.reports = Path(reports)
        self.now = now or datetime.now(timezone.utc)

    @classmethod
    def from_cache(cls) -> "Chamber":
        need = ["prices", "companies"]
        missing = [t for t in need if not has_table(t)]
        if missing:
            raise FileNotFoundError(f"no {missing} table yet; run scripts/download.py first")
        opt = {t: read_table(t) if has_table(t) else None for t in ("fundamentals", "insider", "exclusions")}
        return cls(read_table("prices"), read_table("companies"), opt["fundamentals"], opt["insider"],
                   opt["exclusions"])

    # -- data, cut at the split end ---------------------------------------------
    def panel(self, cutoff) -> Panel:
        cutoff = pd.Timestamp(cutoff)
        px = self.prices[self.prices["date"] <= cutoff]
        adj = px.pivot(index="date", columns="symbol", values="adj_close").sort_index()
        close = px.pivot(index="date", columns="symbol", values="close").reindex_like(adj)
        excl = pd.DataFrame(False, index=adj.index, columns=adj.columns)
        for s, a, b in zip(self.excl["symbol"], self.excl["start"], self.excl["end"]):
            if s in excl:
                excl.loc[pd.Timestamp(a):pd.Timestamp(b), s] = True
        return Panel(adj, close, excl, self.fund, self.ins).upto(cutoff)

    def _members(self, day) -> frozenset[str]:
        return membership.members_on(day, self.members)

    def schedule(self, cand: Candidate | str, panel: Panel, start, end) -> tuple[dict, dict]:
        """Target weights at each decision date, using only data up to that date."""
        sched, skipped = {}, {}
        for d in month_ends(panel.adj_close.index, start, end):
            now = panel.upto(d)
            last = now.adj_close.iloc[-1]
            bad = now.excluded.iloc[-1]
            live = [s for s in self._members(d) if s in last.index and pd.notna(last[s]) and not bad.get(s, False)]
            if cand == "EQUAL_WEIGHT":
                sched[d] = equal_weight(sorted(live))
                continue
            scores = cand.score(now, live, skipped)
            picks = top_fraction(scores, len(live))
            sectors = {p: self.sectors.get(p, UNKNOWN) for p in picks}
            sched[d], _ = apply_limits(equal_weight(picks), sectors,
                                       self.L.max_weight_per_stock, self.L.max_weight_per_sector)
        return sched, skipped

    # -- one run --------------------------------------------------------------
    def start_for(self, name: str | None, split_start: str) -> str:
        late = self.pb.signal_start.get(name or "")
        return max(split_start, late) if late else split_start

    def _guard(self, split: str, vault_token=None) -> tuple[str, str, str]:
        s = self.pb.splits
        if split == "train":
            return s.train_start, s.train_end, s.train_end
        if split == "validate":
            return s.validate_start, s.validate_end, s.validate_end
        if split == "vault":
            if vault_token is not _VAULT_KEY:
                raise VaultLocked("vault runs only through Chamber.vault_test()")
            last = str(self.prices["date"].max().date())
            return s.vault_start, last, last
        raise ValueError(f"unknown split {split}")

    def _run(self, cand, split: str, cost: float, vault_token=None, for_signal: str | None = None,
             freeze_after=None) -> dict:
        """One engine run. Benchmarks take `for_signal` so they start when that signal starts."""
        name = cand if isinstance(cand, str) else cand.name
        start, end, cutoff = self._guard(split, vault_token)
        start = self.start_for(for_signal or name, start)
        if name in ("SPY", "EQUAL_WEIGHT"):  # benchmarks don't change; compute once per data snapshot
            key = BENCH_CACHE / f"{name}_{split}_{start}_{cost}_{engine.snapshot_id(self.prices)}.pkl"
            if key.exists():
                return pd.read_pickle(key)
            out = self._run_uncached(name, split, cost, start, end, cutoff)
            key.parent.mkdir(parents=True, exist_ok=True)
            pd.to_pickle(out, key)
            return out
        return self._run_uncached(cand, split, cost, start, end, cutoff, freeze_after)

    def _run_uncached(self, cand, split, cost, start, end, cutoff, freeze_after=None) -> dict:
        t0 = time.monotonic()
        panel = self.panel(cutoff)
        px = self.prices[self.prices["date"] <= pd.Timestamp(cutoff)]
        name = cand if isinstance(cand, str) else cand.name
        if name == "SPY":
            first = month_ends(panel.adj_close.index, start, end)[0]
            sched, skipped = {first: {"SPY": 1.0}}, {}
        else:
            sched, skipped = self.schedule(cand, panel, start, end)
        first = min(sched)
        stop = None if name in ("SPY", "EQUAL_WEIGHT") else self.L.stop_loss
        res = engine.run(px, sched, first, end, cost, stop, freeze_after=freeze_after)
        r = M.window(res.returns, start, end)
        return {"candidate": name, "split": split, "cost": cost, "start": start, "end": end,
                "returns": r, "turnover": res.turnover, "stop_losses": res.stop_losses,
                "rebalances": res.rebalances, "engine_notes": res.notes[:50],
                "holdings_avg": sum(len(w) for w in sched.values()) / max(1, len(sched)),
                "skipped": {k: len(v) for k, v in skipped.items()},
                "delistings": self._delisting_impact(px, sched, start, end),
                "unknown_sector_weight": sum(w for d in sched.values() for s, w in d.items()
                                             if self.sectors.get(s, UNKNOWN) == UNKNOWN) / max(1, len(sched)),
                "seconds": round(time.monotonic() - t0, 1)}

    def _delisting_impact(self, px: pd.DataFrame, sched: dict, start, end) -> dict:
        """How much the -100% / deal-price rule moved this run: weight held x price change applied."""
        ev = px[(px["source"] == "delisting_rule") & (px["date"] >= pd.Timestamp(start)) &
                (px["date"] <= pd.Timestamp(end))] if "source" in px else px.iloc[:0]
        keys = sorted(sched)
        hit, impact = 0, 0.0
        for sym, day, adj in zip(ev["symbol"], ev["date"], ev["adj_close"]):
            k = [x for x in keys if x < day]
            w = sched[k[-1]].get(sym, 0.0) if k else 0.0
            if w <= 0:
                continue
            prev = px[(px["symbol"] == sym) & (px["date"] < day)]["adj_close"]
            if len(prev):
                hit += 1
                impact += w * (adj / prev.iloc[-1] - 1)
        return {"events_in_period": int(len(ev)), "events_held": hit, "portfolio_effect": impact}

    def _record(self, out: dict, spy: dict) -> None:
        active = out["returns"] - spy["returns"].reindex(out["returns"].index).fillna(0)
        sd = active.std()
        out["active_sharpe_daily"] = float(active.mean() / sd) if sd and sd > 0 else None
        out["summary"] = M.summary(out["returns"])
        self.reg.record_run(**{k: v for k, v in out.items() if k != "returns"},
                            pass_bar_sha=file_sha256(PASS_BAR_PATH),
                            data_snapshot=engine.snapshot_id(self.prices), synthetic=self.synthetic)

    def _check_hunt(self, cand: Candidate) -> None:
        first = self.reg.first_real_run()
        if first and not self.synthetic:
            months = (self.now - datetime.fromisoformat(first)).days / 30.44
            if months > self.pb.hunt.deadline_months and cand.name not in self.reg.candidates_tried():
                raise PermissionError("3-month hunt deadline has passed: stop and report, no new candidates")
        if cand.kind == "combination":
            combos = {r["candidate"] for r in self.reg.runs() if r.get("kind") == "combination"}
            if cand.name not in combos and len(combos) >= self.pb.hunt.max_combinations:
                raise PermissionError(f"combination cap of {self.pb.hunt.max_combinations} reached")

    # -- the full evaluation ------------------------------------------------------
    def _split_runs(self, cand: Candidate, split: str, runs: dict, record: bool, tok=None) -> None:
        c = self.pb.costs
        spy = self._run("SPY", split, c.base_per_side, tok, for_signal=cand.name)
        ew = self._run("EQUAL_WEIGHT", split, c.base_per_side, tok, for_signal=cand.name)
        if record:
            self._record(spy, spy)
            self._record(ew, spy)
        for cost_name, cost in (("base", c.base_per_side), ("stress", c.stress_per_side)):
            out = self._run(cand, split, cost, tok)
            out["kind"] = cand.kind
            if record:
                self._record(out, spy)
            runs[(split, cost_name)] = out
        runs[(split, "spy")], runs[(split, "ew")] = spy, ew
        runs[(split, "kill")] = self._kill_variants(cand, split, runs[(split, "base")], spy, tok)

    def _kill_variants(self, cand, split, base: dict, spy: dict, tok=None) -> dict:
        """The three kill-switch versions the owner is choosing between (DATA_HANDOFF section 5).
        Shown side by side; the pass bar itself is judged without any of them."""
        L, cost = self.L, self.pb.costs.base_per_side
        r, b = base["returns"], spy["returns"]
        a_r, a_day = M.kill_switch_a(r, cost, L.drawdown_kill)
        b_r, b_day = M.kill_switch_b(r, b, cost, L.drawdown_kill)
        if a_day is not None:
            c_r = self._run(cand, split, cost, tok, freeze_after=pd.Timestamp(a_day))["returns"]
        else:
            c_r = r
        _, spy_day = M.kill_switch_a(b, cost, L.drawdown_kill)
        return {"none": (r, None), "A: sell and stop": (a_r, a_day),
                "B: only if 15% worse than SPY": (b_r, b_day), "C: pause, keep positions": (c_r, a_day),
                "spy_A_day": spy_day}

    def evaluate(self, cand: Candidate) -> dict:
        self._check_hunt(cand)
        runs = {}
        for split in ("train", "validate"):
            self._split_runs(cand, split, runs, record=True)
        verdict = self.gate(cand, runs)
        if verdict["passed"]:
            self.reg.mark_passed_validation(cand.name, {"checks": verdict["checks"]})
        self.write_report(cand, runs, verdict, "validation")
        return {"runs": runs, "verdict": verdict}

    def _period_losses(self, runs: dict, splits: list[str]) -> dict[str, bool | None]:
        """Lost to SPY in each market period? Runs are joined across splits first, because a
        period (e.g. the 2009-2019 bull) can span two splits. None = run covers <80% of it."""
        have = [sp for sp in splits if (sp, "base") in runs]
        if not have:
            return {k: None for k in self.pb.periods}
        r = pd.concat([runs[(sp, "base")]["returns"] for sp in have]).sort_index()
        s = pd.concat([runs[(sp, "spy")]["returns"] for sp in have]).sort_index()
        r, s = r[~r.index.duplicated()], s[~s.index.duplicated()]
        out = {}
        for pname, (a, b) in self.pb.periods.items():
            rr, ss = M.window(r, a, b), M.window(s, a, b)
            span = (pd.Timestamp(b) - pd.Timestamp(a)).days
            covered = (rr.index.max() - rr.index.min()).days if len(rr) > 1 else 0
            out[pname] = None if covered < PERIOD_COVERAGE * span else bool(M.total_return(rr) < M.total_return(ss))
        return out

    def _rule3(self, losses: dict) -> tuple[str, bool]:
        tested = {k: v for k, v in losses.items() if v is not None}
        max_losses = math.floor(self.pb.rules.max_period_losses_fraction * len(tested))
        missing = [k for k, v in losses.items() if v is None]
        label = (f"market periods: lost to SPY in {sum(tested.values())} of {len(tested)} tested "
                 f"(max {max_losses})" + (f"; NOT tested: {', '.join(missing)}" if missing else ""))
        return label, bool(tested) and sum(tested.values()) <= max_losses

    def _beats(self, runs: dict, split: str) -> dict[str, bool]:
        r, s = runs[(split, "base")]["returns"], runs[(split, "spy")]["returns"]
        st = runs[(split, "stress")]["returns"]
        return {f"{split}: beats SPY after 0.15% costs": M.total_return(r) > M.total_return(s),
                f"{split}: Sharpe above SPY's": M.sharpe(r) > M.sharpe(s),
                f"{split}: max drawdown no worse than SPY's": M.max_drawdown(r) >= M.max_drawdown(s),
                f"{split}: beats SPY at 0.30% costs (reported, not required)": M.total_return(st) > M.total_return(s)}

    def _dsr(self, runs: dict, splits: list[str]) -> float:
        act = pd.concat([runs[(sp, "base")]["returns"] - runs[(sp, "spy")]["returns"].reindex(
            runs[(sp, "base")]["returns"].index).fillna(0) for sp in splits])
        n = max(1, len(self.reg.candidates_tried()))
        return M.deflated_sharpe(act, n, self.reg.trial_sharpes("validate"))

    def gate(self, cand: Candidate, runs: dict) -> dict:
        """Pre-vault gate: pass bar rules 1, 2, 5 on validation; rule 3 on the periods seen so far."""
        checks = self._beats(runs, "validate")
        losses = self._period_losses(runs, ["train", "validate"])
        # bear_2022 is in the vault, so before the vault only the other periods can count
        label, ok = self._rule3({k: v for k, v in losses.items() if k != "bear_2022"})
        checks[label] = ok
        dsr = self._dsr(runs, ["validate"])
        checks[f"deflated Sharpe of edge >= {self.pb.rules.min_deflated_sharpe_prob} "
               f"(N={max(1, len(self.reg.candidates_tried()))} tried)"] = \
            bool(dsr >= self.pb.rules.min_deflated_sharpe_prob)
        required = {k: v for k, v in checks.items() if "not required" not in k}
        return {"passed": all(required.values()), "checks": checks, "periods": losses, "dsr": dsr}

    def vault_test(self, cand: Candidate) -> dict:
        self.reg.open_vault(cand.name)  # raises unless passed validation and never opened
        runs = {}
        for split in ("train", "validate", "vault"):
            tok = _VAULT_KEY if split == "vault" else None
            self._split_runs(cand, split, runs, record=split == "vault", tok=tok)
        checks = {**self._beats(runs, "validate"), **self._beats(runs, "vault")}
        losses = self._period_losses(runs, ["train", "validate", "vault"])
        label, ok = self._rule3(losses)
        checks[label] = ok
        dsr = self._dsr(runs, ["validate", "vault"])
        checks[f"deflated Sharpe of edge >= {self.pb.rules.min_deflated_sharpe_prob}"] = \
            bool(dsr >= self.pb.rules.min_deflated_sharpe_prob)
        required = {k: v for k, v in checks.items() if "not required" not in k}
        verdict = {"passed": all(required.values()), "checks": checks, "periods": losses, "dsr": dsr}
        self.reg.book.record("chamber", "vault_result", "final vault verdict", candidate=cand.name,
                             passed=verdict["passed"], checks=checks)
        self.write_report(cand, runs, verdict, "VAULT (final)")
        return {"runs": runs, "verdict": verdict}

    # -- plain report ---------------------------------------------------------------
    def write_report(self, cand: Candidate, runs: dict, verdict: dict, stage: str) -> Path:
        self.reports.mkdir(parents=True, exist_ok=True)
        tag = "SYNTHETIC TEST DATA - NOT A REAL RESULT. " if self.synthetic else ""
        L = [f"# {tag}{cand.name}: {stage}", "",
             f"**{'PASSED' if verdict['passed'] else 'FAILED'}** the pass bar for this stage.", "",
             f"Why we thought it might work: {cand.reason}", "",
             f"Tests run so far: {self.reg.total_runs()} runs, {len(self.reg.candidates_tried())} distinct candidates.",
             ""]
        late = self.pb.signal_start.get(cand.name)
        if late:
            L += [f"**Starts {late}, not {self.pb.splits.train_start}: free point-in-time data for this signal "
                  "begins later." + (" It has NO 2008 test." if late > "2008-01-01" else "") + "**", ""]
        L += ["| check | result |", "|---|---|"]
        L += [f"| {k} | {'yes' if v else 'NO'} |" for k, v in verdict["checks"].items()]
        L += ["", "| period | lost to SPY? |", "|---|---|"]
        L += [f"| {k} | {'not tested' if v is None else ('LOST' if v else 'beat')} |"
              for k, v in verdict["periods"].items()]
        L += ["", f"Deflated Sharpe probability of a real edge over SPY: {verdict['dsr']:.2f}", "",
              "| split | who | total return | CAGR | Sharpe | max drawdown | turnover/rebal | stop-losses | seconds |",
              "|---|---|---|---|---|---|---|---|---|"]
        for (sp, who), o in sorted((k, v) for k, v in runs.items() if k[1] != "kill"):
            s = M.summary(o["returns"])
            L.append(f"| {sp} | {who if who in ('spy', 'ew') else cand.name + ' @' + who} | {s['total_return']:.1%} | "
                     f"{s['cagr']:.1%} | {s['sharpe']:.2f} | {s['max_drawdown']:.1%} | {o['turnover']:.0%} | "
                     f"{o['stop_losses']} | {o.get('seconds', '')} |")
        for sp in ("train", "validate", "vault"):
            if (sp, "base") not in runs:
                continue
            base = runs[(sp, "base")]
            y = M.yearly_excess(base["returns"], runs[(sp, "spy")]["returns"])
            L += ["", f"## {sp}", "", f"Walk-forward, year by year vs SPY: beat SPY in "
                  f"{int((y['excess'] > 0).sum())} of {len(y)} years. "
                  + ", ".join(f"{r.year}: {r.excess:+.1%}" for r in y.itertuples())]
            t = M.stress_triggers(base["returns"], self.L.daily_loss_pause, self.L.drawdown_kill)
            L.append(f"Daily-loss pause (2%) would have fired {t['daily_loss_pauses']} times.")
            k = runs.get((sp, "kill"))
            if k:
                L += ["", f"Kill-switch versions (owner to choose; SPY itself would trip version A on "
                      f"{k['spy_A_day'] or 'no day'}):", "",
                      "| version | fired on | total return | max drawdown | Sharpe |", "|---|---|---|---|---|"]
                for name, (rr, day) in ((n, v) for n, v in k.items() if n != "spy_A_day"):
                    s = M.summary(rr)
                    L.append(f"| {name} | {day or 'never'} | {s['total_return']:.1%} | {s['max_drawdown']:.1%} | "
                             f"{s['sharpe']:.2f} |")
            d = base.get("delistings", {})
            L.append(f"\nDelisting rule: {d.get('events_in_period', 0)} final-price events in this period, "
                     f"{d.get('events_held', 0)} hit a stock we held; total effect on the portfolio "
                     f"{d.get('portfolio_effect', 0.0):+.1%}.")
            L.append(f"Average weight in stocks with unknown sector: {base.get('unknown_sector_weight', 0):.1%}.")
        L += ["", "How this could be wrong:",
              "- Coverage and survivorship: see data/AUDIT_REPORT.md for missing member-days and departed names.",
              "- Stocks with no explanation for delisting are booked at -100%; acquisitions without a checked "
              "deal price use their last trade.",
              "- Sectors are today's SEC SIC codes, not historical ones.",
              "- Prices are stitched from several free sources; seams and conflicts are in the audit report.",
              "- Fills are at the next day's close with flat costs; real fills differ.",
              "- One historical path. A pass is evidence, not proof."]
        p = self.reports / f"{cand.name}_{stage.split()[0].lower()}.md"
        p.write_text("\n".join(L) + "\n")
        return p


_VAULT_KEY = object()
