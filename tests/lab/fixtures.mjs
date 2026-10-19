// Mocked GitHub and raw.githubusercontent.com answers for the /lab tests.
const NOW = Date.now();
const iso = ms => new Date(NOW - ms).toISOString();

export const WORKFLOWS = {total_count: 5, workflows: [
  {id: 1, name: "NFL props bot -- prices + model (paper only)", path: ".github/workflows/nfl_props_bot.yml", state: "active"},
  {id: 2, name: "Game lines -- every Kalshi spread", path: ".github/workflows/game_lines.yml", state: "active"},
  {id: 3, name: "Frozen guard -- test files and results stay locked", path: ".github/workflows/frozen_guard.yml", state: "active"},
  {id: 4, name: "Research lab -- candidates", path: ".github/workflows/research_lab.yml", state: "active"},
  {id: 5, name: "NBA preseason trial (not counted)", path: ".github/workflows/nba preseason trial.yaml", state: "active"},
]};

const run = (id, wf, status, conclusion, startedAgo, mins) => ({
  id, run_number: id, workflow_id: wf, status, conclusion, event: "schedule", head_branch: "main",
  run_started_at: iso(startedAgo), created_at: iso(startedAgo), updated_at: iso(startedAgo - mins * 60e3),
  html_url: `https://github.com/DeVig-AI/AI-Bettor-Model/actions/runs/${id}`,
});

export const RUNS = {workflow_runs: [
  run(105, 1, "in_progress", null, 2 * 60e3, 0),
  run(104, 2, "completed", "failure", 20 * 60e3, 3),
  run(103, 1, "completed", "success", 60 * 60e3, 4),
  run(102, 3, "completed", "success", 3 * 3600e3, 1),
  run(101, 4, "queued", null, 4 * 60e3, 0),
]};

export const STATUS = {
  updated_at: iso(5 * 60e3), scope: "NFL", effect_name: "Edge beyond the closing line", effect_unit: "pts",
  note: "Expected result: nothing passes the exam.", exam_name: "Sealed 2025 exam",
  constitution: {version: "v1", sha256: "ab".repeat(32)},
  counts: {tried: 9, running: 1, lab_pass: 1, exam_pass: 0, exam_budget_left: 3, exam_budget_total: 3},
  candidates: [
    {id: "qb-adj", name: "+ QB adjustment", market: "spread", family: "Elo family", state: "lab_pass",
     reason: "Plain team ratings, plus a bump when the starting quarterback changes.",
     gates: [{name: "2016–18", effect: 1.6, ci: [-0.1, 3.3], games: 801, passed: true},
             {name: "2019–21", effect: 1.5, ci: [-0.2, 3.2], games: 812, passed: true},
             {name: "2022–24", effect: 1.1, ci: [-0.6, 2.8], games: 838, passed: true}],
     pooled: {name: "Pooled 2016–24", effect: 1.4, ci: [0.4, 2.4], adj_p: 0.03}, attempts: 9, fade_ratio: 0.69,
     kalshi: {picks: 412, win_rate: 0.534, break_even: 0.518, roi: 0.019},
     rule_split: [{label: "Before 2021", effect: 1.6}, {label: "after 2021", effect: 1.1}, {label: "after 2024 kickoff rule", effect: null, note: "too few games"}],
     exam: {state: "not_taken"}, verdict: "Passed all three gates after adjusting for 9 attempts.", graded_at: iso(2 * 3600e3), run_number: 41,
     run_url: "https://github.com/DeVig-AI/AI-Bettor-Model/actions/runs/77", file_url: "https://github.com/DeVig-AI/AI-Bettor-Model/tree/main/research",
     updated_at: iso(3600e3)},
    {id: "travel", name: "+ Travel distance", market: "spread", state: "running", gate_now: 2, started_at: iso(3 * 60e3),
     eta_at: new Date(NOW + 6 * 60e3).toISOString(), gates: [{name: "2016–18", effect: 0.4, ci: [-0.5, 1.3], games: 801, passed: true}]},
    {id: "rest", name: "+ Rest <img src=x onerror=alert(1)> & bye weeks", market: "spread", state: "failed", fail_reason: "faded",
     gates: [{name: "2016–18", effect: 1.2, ci: [0.1, 2.3], passed: true}, {name: "2019–21", effect: -0.3, ci: [-1.5, 0.9], passed: false},
             {name: "2022–24", effect: -0.4, ci: [-1.6, 0.8], passed: false}],
     pooled: {effect: 0.2, ci: [-0.9, 1.3], adj_p: 0.6}, verdict: "No edge.", run_url: "javascript:alert(1)"},
    {id: "pace", name: "Pace + efficiency", market: "total", state: "failed", pooled: {effect: -0.5, ci: [-1.7, 0.7]},
     gates: [{name: "a", passed: false}, {name: "b", passed: false}, {name: "c", passed: true}]},
    {id: "f1", name: "Failed one", market: "total", state: "failed"},
    {id: "q1", name: "Queued one", market: "props", state: "queued"},
  ],
  lessons: [{text: "Starting-QB changes added signal in all three eras.", kind: "helped", candidates: ["qb-adj"]},
            {text: "Rest days helped in 2016–18, then vanished.", kind: "faded", candidates: ["rest"]},
            {text: "Margin-of-victory weighting changed nothing.", kind: "no_effect", candidates: []}],
  runs: [
    {kind: "lab", name: "Research Lab #12", started_at: iso(40 * 60e3), finished_at: iso(40 * 60e3 - 11e3), duration_s: 11,
     run_number: 12, run_url: "https://github.com/DeVig-AI/AI-Bettor-Model/actions/runs/88",
     summary: "8 tested · 1 passed the lab · failed: 6 gate 2, 1 faded",
     steps: [1, 2, 3, 4, 5, 6, 7, 8].map(i => ({at: iso(40 * 60e3 - i * 1e3), id: i === 1 ? "qb-adj" : "rest",
       name: i === 1 ? "+ QB adjustment" : "Step <b>" + i, text: "pooled +0.10 pts [-0.66, +0.85] · gates +0.25 / -0.87 / +0.89",
       state: i === 1 ? "lab_pass" : "failed", fail_reason: i === 1 ? "" : "gate_2",
       gates: i === 1 ? [true, true, true] : [true, false, true]}))},
    {kind: "exam", name: "Sealed exam 1", started_at: iso(3 * 86400e3), finished_at: null, summary: "being scored",
     run_url: "javascript:alert(1)", steps: [{at: iso(3 * 86400e3), id: "x", name: "x", text: "spent", state: "bogus"}]},
  ],
  promoted: [{name: "Rest-days edge on spreads", picks: 41, wins: 23, losses: 18, roi: 0.042, vs_kalshi_note: "Beat the Kalshi close on 26 of 41."}],
};

// fetch() stand-in. scenario: "mixed" (status.json present, one failed workflow) or "empty" (no status.json, all green)
export function mockFetch(scenario, calls = []) {
  return async (url, init) => {
    url = String(url);
    calls.push({url, init});
    const j = (b, status = 200) => new Response(JSON.stringify(b), {status, headers: {"content-type": "application/json"}});
    if (url.includes("/actions/workflows?")) return j(WORKFLOWS);
    if (url.includes("/actions/runs?")) {
      if (scenario === "empty") return j({workflow_runs: RUNS.workflow_runs.filter(r => r.conclusion !== "failure")});
      return j(RUNS);
    }
    if (/\/actions\/workflows\/\d+\/runs/.test(url)) return j({workflow_runs: []});
    if (url.endsWith("/research/status.json") || url.includes("/contents/research/status.json")) return scenario === "empty" ? new Response("404: Not Found", {status: 404}) : j(STATUS);
    return new Response("nope", {status: 599});
  };
}
