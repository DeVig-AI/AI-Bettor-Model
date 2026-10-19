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
  updated_at: iso(5 * 60e3),
  constitution: {version: "v1", sha256: "ab".repeat(32)},
  counts: {tried: 9, running: 1, lab_pass: 3, exam_pass: 1, exam_budget_left: 4},
  candidates: [
    {id: "sp-rest-1", name: "Rest-days edge on spreads", market: "spread", family: "rest", reason: "Teams off a bye cover more?",
     state: "exam_pass", gates: [{name: "2016–18", effect: 0.021, ci: [0.004, 0.038], games: 790, passed: true},
       {name: "2019–21", effect: 0.015, ci: [0.001, 0.03], games: 812, passed: true},
       {name: "2022–24", effect: 0.012, ci: [0.0, 0.025], games: 700, passed: true}],
     pooled: {effect: 0.016, ci: [0.005, 0.027], adj_p: 0.031}, verdict: "Held up in every window and the exam.",
     run_url: "https://github.com/DeVig-AI/AI-Bettor-Model/actions/runs/77", updated_at: iso(3600e3)},
    {id: "tot-wind-2", name: "Wind <img src=x onerror=alert(1)> unders", market: "total", family: "weather", reason: "Wind lowers scoring.",
     state: "failed", gates: [{name: "2016–18", effect: -0.01, ci: [-0.03, 0.01], games: 300, passed: false}],
     pooled: {effect: -0.01, ci: [-0.03, 0.01], adj_p: 0.6}, verdict: "No edge.", run_url: "javascript:alert(1)"},
    {id: "pr-usage-3", name: "Usage spike props", market: "props", state: "running", gates: [], pooled: null},
  ],
  lessons: [{text: "Rest effects were stronger for road teams.", kind: "helped", candidates: ["sp-rest-1"]}],
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
    if (url.endsWith("/research/status.json")) return scenario === "empty" ? new Response("404: Not Found", {status: 404}) : j(STATUS);
    return new Response("nope", {status: 599});
  };
}
