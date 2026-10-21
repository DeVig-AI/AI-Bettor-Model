#!/usr/bin/env python3
"""
nhl_props_fit_v1.py -- writes the frozen NHL prop model, nhl/nhl_props_model_v1_tables.json: the settings the design
study chose (nhl/design/design_v1.json) and, for the ratio method, the ratio tables fit on every season from 2010-11
through 2025-26. Box scores only; no price is read. Run once, before the pre-registrations are hashed.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nhl_props_model_lib_v1 as L  # noqa: E402

FIT_SEASONS = list(range(2010, 2026))                   # 2010-11 .. 2025-26; 2026-27 is the live season


def main():
    ch = json.load(open(os.path.join(HERE, "design", "design_v1.json")))["chosen"]
    P = {"span_short": ch["span_short"], "span_long": ch["span_long"], "shrink_k": ch["shrink_k"],
         "method": ch["method"], "min_prev": 5, "fit_seasons": FIT_SEASONS}
    tables = {}
    if P["method"] == "ratio":
        pg = L.player_games(L.load_games(seasons=FIT_SEASONS))
        tables = L.fit_ratio_tables(L.add_expectations(pg, P["span_short"], P["span_long"], P["shrink_k"]), min_prev=5)
    out = {"model": "NHL_PROPS_MODEL_V1", "params": P, "fit_seasons": "2010-11 to 2025-26 (NHL API box scores)",
           "stats": L.STATS, "tables": tables}
    json.dump(out, open(os.path.join(HERE, "nhl_props_model_v1_tables.json"), "w"), separators=(",", ":"))
    print(json.dumps(P))


if __name__ == "__main__":
    main()
