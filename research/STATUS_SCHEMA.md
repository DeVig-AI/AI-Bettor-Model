# research/status.json -- what the Research Lab writes for the owner's /lab page

The Research Lab keeps one file, `research/status.json`, on `main`. The private `/lab` page
(`functions/lab.js`, data from `functions/api/lab.js`) reads it from raw.githubusercontent.com every ~3 minutes.
Until the file exists, the page shows "Lab hasn't run yet". Rewrite the whole file on every change and keep it under
~500 KB. Fields not listed here are dropped. A field that's missing or has the wrong type shows as "—" (or its row is
left out) and doesn't break the page. Use `null`, not strings like "n/a", for anything not known yet.
Times are ISO 8601. Links are shown only if they start with `https://github.com/`.

```
{ "updated_at": "2026-10-19T14:05:00Z",
  "scope": "NFL",                                  // summary card label: "RESEARCH · NFL"
  "effect_name": "Edge beyond the closing line",   // title of the gates card on a candidate's screen
  "effect_unit": "pts",                            // unit of every effect / ci below (cover points); default "pts"
  "note": "Expected result: nothing passes the exam.",   // optional one line under the summary
  "exam_name": "Sealed 2025 exam",
  "constitution": {"version": "v1", "sha256": "..."},
  "links": {"constitution": "https://github.com/...", "ledger": "https://github.com/...", "lessons": "https://github.com/..."},
  "counts": {
    "tried": 9, "running": 1, "lab_pass": 1, "exam_pass": 0,
    "exam_budget_left": 3, "exam_budget_total": 3       // "Sealed 2025 exam · 3 of 3 left"
  },
  "candidates": [{
    "id": "qb-adj",                             // stable and unique; the page links to it as /lab#c/<id>
    "name": "+ QB adjustment",
    "market": "spread",                         // spread | total | props
    "family": "Elo family",
    "reason": "Why it was tried, one or two sentences.",
    "state": "lab_pass",                        // queued | running | failed | lab_pass | exam_pass | exam_fail | promoted | stopped
    "fail_reason": "faded",                     // optional short word shown on the chip: "✕ Failed · faded"
    "gate_now": 2,                              // running only: which gate (1-3) is running now
    "started_at": "...", "eta_at": "...",       // running only: "Started 3 min ago · about 6 min left"
    "gates": [                                  // in order; the first three are the card's pips
      {"name": "2016–18", "effect": 1.6, "ci": [-0.1, 3.3], "games": 801, "passed": true},
      {"name": "2019–21", "effect": 1.5, "ci": [-0.2, 3.2], "games": 812, "passed": true},
      {"name": "2022–24", "effect": null, "ci": null, "games": null, "passed": null}       // null = not run yet
    ],
    "pooled": {"name": "Pooled 2016–24", "effect": 1.4, "ci": [0.4, 2.4], "adj_p": 0.03},  // adj_p: adjusted for all attempts
    "attempts": 9,                              // "Holds after 9 attempts"
    "p_bar": 0.05,                              // the bar adj_p must clear (default 0.05)
    "fade_ratio": 0.69, "fade_needed": 0.5,     // last gate's effect / first gate's; "Not fading: 69% of the first · needs 50%"
    "kalshi": {"picks": 412, "win_rate": 0.534, "break_even": 0.518, "roi": 0.019},   // picks at Kalshi price + fee (fractions)
    "rule_split": [{"label": "Before 2021", "effect": 1.6}, {"label": "after 2021", "effect": 1.1},
                   {"label": "after 2024 kickoff rule", "effect": null, "note": "too few games"}],
    "exam": {"state": "not_taken", "effect": null, "ci": null, "taken_at": null, "note": ""},   // not_taken | passed | failed
    "verdict": "One plain sentence from the Inspector General.",
    "graded_at": "...", "run_number": 41,
    "run_url": "https://github.com/DeVig-AI/AI-Bettor-Model/actions/runs/123",
    "file_url": "https://github.com/DeVig-AI/AI-Bettor-Model/blob/main/research/candidates/qb-adj.json",
    "updated_at": "..."
  }],
  "lessons": [{                                // shown as "Exploratory · not proof"
    "text": "Rest days helped in 2016–18, then vanished.",
    "kind": "faded",                           // helped | faded | no_effect
    "candidates": ["rest"]                     // ids; shown as "from <name>"
  }],
  "runs": [{                                   // optional, newest first, up to 10: the "What the lab did" timeline
    "kind": "lab",                             // lab | exam | review | paper | search
    "name": "Research Lab #12", "run_number": 12, "run_url": "https://github.com/...",
    "started_at": "...", "finished_at": "...", // finished_at null = still running (the page then checks every 15 s)
    "duration_s": 11,
    "summary": "18 tested → 9 past gate 1 → 4 past gate 2 → 0 passed the lab → 0 passed the exam → 0 promoted",
    "funnel": [{"label": "tested", "count": 18}, {"label": "past gate 1", "count": 9}],   // the history card shows
                                               // only these counts (owner's choice); search rounds: models scored →
                                               // consistent → strong (t ≥ bar) → sent to confirmation
    "steps": [{                                // optional, up to 60 (the lab writes none since the funnel;
                                               // the page still draws them if present)
      "at": "...", "id": "elo-base", "name": "Plain Elo",
      "text": "pooled +0.10 pts [-0.66, +0.85] · gates +0.25 / -0.87 / +0.89",
      "state": "failed", "fail_reason": "gate_2",  // a candidate state, or "info"
      "gates": [true, false, true]                // each gate positive? drawn as the three circles (null = not run)
    }]
  }],
  "promoted": [{                               // shown as "Promoted, not proven"
    "name": "...", "picks": 41, "wins": 23, "losses": 18,
    "roi": 0.042,                              // fraction: 0.042 = +4.2%; 0 = break-even
    "vs_kalshi_note": "Beat the Kalshi close on 26 of 41."
  }]
}
```

### Sports (added with college football; backward compatible)
The top level stays one sport's block, exactly as above (NFL), so a page that knows nothing about sports keeps working.
Three optional fields add the others:
```
  "sport": "NFL", "sport_name": "NFL",            // which sport the top-level block is
  "attempts": {"this_sport": 18, "all_sports": 34, "note": "..."},   // Constitution C4: the correction counts
                                                  // this sport's attempts; the all-sports count is reported only
  "sports": [{"key": "NFL", "name": "NFL"}, {"key": "CFB", "name": "College football"}],   // the page's sport switch
  "by_sport": {"CFB": { ...a whole block with every field above (no by_sport inside)... }}
```
Each candidate's `pooled` may also carry `adj_p_all_sports`: its Holm-adjusted p over every attempt of every sport
(reported only). Candidate ids are unique across sports (college football ids start with `cfb-`), so `/lab#c/<id>`
finds a candidate in any sport. The page shows the switch only when `sports` lists two or more, and remembers the
viewer's choice.

Notes for the lab:
- Keep `counts` consistent with `candidates`. The funnel bar counts candidates by state (failed / running / lab pass / queued).
- `effect` and `ci` share one unit across gates, `pooled`, `rule_split` and `exam`. The bars are drawn around 0 on one shared scale.
- GitHub workflows group themselves by name/file: anything with "research", "lab", "inspector" or "constitution" goes
  under Research, anything with "props" under Props, and everything else under Games & App. So name the lab's
  workflows e.g. `research_lab.yml` / "Research lab -- ...".
- `runs` was added after v1 of this contract; the page shows nothing for it when it's missing.
- How fresh the page is: it asks the server every 60 s (every 15 s while a run is in progress); the server re-reads
  status.json at most every 15 s, through the GitHub API when `GITHUB_TOKEN` is set (otherwise from
  raw.githubusercontent.com, which itself caches up to 5 minutes). The ↻ button re-reads status.json at once.
- Comments above (`//`) are for this document only; the real file is plain JSON.
