# research/status.json -- what the Research Lab writes for the owner's /lab page

The Research Lab keeps one file, `research/status.json`, on `main`. The private `/lab` page
(`functions/lab.js`, data from `functions/api/lab.js`) reads it from raw.githubusercontent.com every ~3 minutes.
Until the file exists, the page shows "Lab hasn't run yet". Rewrite the whole file on every change; keep it under
~500 KB. Fields not listed here are dropped. A missing or wrongly typed field shows as "—" and doesn't break the page.

```
{ "updated_at": "2026-10-19T14:05:00Z",                 // ISO 8601, when this file was written
  "constitution": {"version": "v1", "sha256": "..."},   // research/CONSTITUTION.md version and its sha256
  "counts": {
    "tried": 12,              // candidates ever started
    "running": 1,             // in progress now
    "lab_pass": 3,            // passed every lab gate
    "exam_pass": 1,           // passed the sealed exam
    "exam_budget_left": 4     // sealed-exam looks still allowed
  },
  "candidates": [{
    "id": "spread-rest-001",                  // stable id, unique
    "name": "Rest-days edge on spreads",
    "market": "spread",                       // spread | total | props
    "family": "rest",                         // free text, groups related ideas
    "reason": "Why it was tried, one or two sentences.",
    "state": "lab_pass",                      // queued | running | failed | lab_pass | exam_pass | exam_fail | promoted | stopped
    "gates": [                                // in order; the page shows the first three as pips
      {"name": "2016–18", "effect": 0.021, "ci": [0.004, 0.038], "games": 790, "passed": true},
      {"name": "2019–21", "effect": 0.012, "ci": [-0.003, 0.027], "games": 812, "passed": false},
      {"name": "2022–24", "effect": null,  "ci": null,            "games": null, "passed": null}   // null = not run yet
    ],
    "pooled": {"effect": 0.016, "ci": [0.005, 0.027], "adj_p": 0.031},   // effect in win-rate points (0.016 = +1.6%)
    "verdict": "One plain sentence a non-statistician can read.",
    "run_url": "https://github.com/DeVig-AI/AI-Bettor-Model/actions/runs/123",   // only github.com links are shown
    "updated_at": "2026-10-19T13:50:00Z"
  }],
  "lessons": [{                              // shown as "Exploratory — not proof"
    "text": "Short-rest favorites faded in every window.",
    "kind": "faded",                         // helped | faded | no_effect
    "candidates": ["spread-rest-001"]
  }],
  "promoted": [{                             // shown as "Promoted, not proven"
    "name": "Rest-days edge on spreads",
    "picks": 41, "wins": 23, "losses": 18,
    "roi": 0.042,                            // a fraction: 0.042 = +4.2%; 0 = break-even
    "vs_kalshi_note": "Beat the Kalshi close on 26 of 41."
  }]
}
```

Notes for the lab:
- Keep `counts` consistent with `candidates` (the page shows both).
- `effect` and `ci` share one unit across gates and `pooled`; the interval bar is drawn around 0.
- Use `null`, not missing keys or strings like "n/a", for anything not known yet.
- Comments above (`//`) are for this document only; the real file is plain JSON.
