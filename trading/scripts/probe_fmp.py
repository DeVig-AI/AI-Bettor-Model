"""Run once after pasting FMP_API_KEY into .env. Uses about 8 requests.

Answers the questions the handoff says to confirm on signup:
  * Is the delisted-companies list in the free tier?
  * How far back do prices go? (need 2001; FMP's free plan is reported as 5 years)
  * Do delisted names (e.g. Lehman) have prices at all?
  * Do fundamentals come with a filing date (needed for point-in-time)?
Writes data/FMP_PROBE.md in plain English.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

from trader.config import ROOT  # noqa: E402
from trader.data import fmp as F  # noqa: E402
from trader.data.store import DATA  # noqa: E402


def main() -> int:
    load_dotenv(ROOT / ".env")
    c = F.FMP(os.environ.get("FMP_API_KEY", ""))
    out = ["# FMP free-tier probe", ""]
    enough = True

    d = c.delisted(0)
    enough &= not F.restricted(d) and bool(F.rows(d))
    out.append(f"- Delisted list: {'NOT in free plan' if F.restricted(d) else f'{len(F.rows(d))} rows on page 1'}"
               f" (HTTP {d['status']})")

    for sym, why in [("AAPL", "a current name"), ("LEHMQ", "Lehman, bankrupt 2008"),
                     ("TWX", "Time Warner, acquired 2018")]:
        r = c.prices_adjusted(sym)
        rows = F.rows(r)
        if rows:
            ds = sorted(x["date"] for x in rows)
            enough &= ds[0] <= "2001-01-31"
            out.append(f"- Prices {sym} ({why}): {len(rows)} days, {ds[0]} to {ds[-1]}")
        else:
            enough = False
            out.append(f"- Prices {sym} ({why}): none (HTTP {r['status']}"
                       f"{', plan restriction' if F.restricted(r) else ''})")

    inc = F.rows(c.income("AAPL"))
    if inc:
        keys = set(inc[0])
        fd = "filingDate" in keys or "fillingDate" in keys
        ds = sorted(x["date"] for x in inc)
        enough &= fd and ds[0] <= "2001-12-31"
        out.append(f"- Income statements AAPL: {len(inc)} quarters, {ds[0]} to {ds[-1]}; "
                   f"filing date {'present' if fd else 'MISSING (cannot do point-in-time value)'}")
    else:
        enough = False
        out.append("- Income statements AAPL: none")
    p = F.rows(c.profile("AAPL"))
    out.append(f"- Profile AAPL: sector={p[0].get('sector') if p else None}")

    out += ["", "Verdict:"]
    out.append("- Free FMP is NOT enough for a survivorship-free test back to 2001. Options: (a) EODHD for one "
               "month, ~$20-40, needs owner OK; (b) test only the years free data covers, clearly labeled."
               if not enough else "- Free FMP looks sufficient. Proceed with the multi-day download.")
    (DATA / "FMP_PROBE.md").write_text("\n".join(out) + "\n")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
