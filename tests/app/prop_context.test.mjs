// The props drawer's "tonight vs usual" numbers (web/src/lib/prop-context.ts): played games, season and home/away
// rates, past games against tonight's opponent, usage and team share, and NFL yards allowed.
// node --test tests/app/prop_context.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { gamesOf, splits, usage, usageCols, yardsAllowed } from "../../web/src/lib/prop-context.ts";

test("NBA games he didn't play are skipped; NFL logs count every row", () => {
  const L = { date: 0, opp: 1, ha: 2, min: 3, pts: 4, season: 5 };
  const log = [["2026-11-08", "BOS", "H", 0, 0, 2027], ["2026-11-06", "NYK", "A", 31, 22, 2027]];
  assert.deepEqual(gamesOf(log, "NBA", L, ["pts"]), [{ date: "2026-11-06", opp: "NYK", ha: "A", season: 2027, v: 22 }]);
  const N = { date: 0, opp: 1, ha: 2, rec_yds: 3, rush_yds: 4, season: 5 };
  assert.equal(gamesOf([["2026-11-08", "PHI", "A", 0, 3, 2027]], "NFL", N, ["rec_yds", "rush_yds"])[0].v, 3);
});

test("season and home/away rates count games over the line; the last 3 meetings with tonight's opponent", () => {
  const g = (date, opp, ha, season, v) => ({ date, opp, ha, season, v });
  const gs = [g("2026-11-08", "PHI", "A", 2027, 80), g("2026-10-11", "WAS", "A", 2027, 71), g("2026-10-04", "ARI", "H", 2027, 40),
    g("2026-01-04", "WAS", "H", 2026, 45), g("2025-12-01", "DAL", "H", 2026, 90), g("2025-09-07", "WAS", "A", 2026, 71), g("2024-12-01", "WAS", "H", 2025, 10)];
  const s = splits(gs, 69.5, 2027, "WAS", true);
  assert.deepEqual(s.season, { hit: 2, n: 3 });
  assert.deepEqual({ hit: s.venue.hit, n: s.venue.n, since: s.venue.since }, { hit: 1, n: 4, since: "2024-12-01" });
  assert.deepEqual(s.vsOpp.map((x) => x.v), [71, 45, 71]);
});

test("usage: last 3 NFL games against the season, and his share of the team's targets", () => {
  const L = { date: 0, opp: 1, ha: 2, tgt: 3, season: 4 };
  const dates = ["2026-11-08", "2026-10-25", "2026-10-18", "2026-10-11", "2026-10-04"];
  const me = { name: "A", pos: "WR", log: dates.map((d, i) => [d, "X", "H", [6, 6, 6, 12, 12][i], 2027]) };
  const mate = { name: "B", pos: "WR", log: dates.map((d) => [d, "X", "H", 18, 2027]) };
  const u = usage("NFL", "receiving_yards", me, [me, mate], L, 2027);
  assert.equal(u.word, "targets");
  assert.equal(u.recent, 6); assert.equal(u.recentN, 3);
  assert.equal(u.season, 8.4); assert.equal(u.seasonN, 5);
  assert.equal(u.share.recent, 0.25);
  assert.ok(Math.abs(u.share.season - 42 / 132) < 1e-9);
  assert.equal(usage("NFL", "receiving_yards", { ...me, log: me.log.slice(0, 3) }, [me], L, 2027), null); // too few games
  assert.deepEqual(usageCols("NFL", "rush_rec_yards").cols, ["car", "tgt"]);
  assert.equal(usageCols("SOCCER", "goals"), null);
});

test("NFL yards allowed add up the passing and rushing of the teams the opponent played this season", () => {
  const L = { date: 0, opp: 1, pass_yds: 2, rush_yds: 3 };
  const games = [["2026-11-01", "DAL", "H", 20, 17, "W", "R", 2027], ["2026-10-25", "PHI", "A", 10, 30, "L", "R", 2027],
    ["2026-01-04", "NYG", "H", 1, 2, "L", "R", 2026]];
  const files = {
    DAL: [{ name: "QB", log: [["2026-11-01", "WAS", 250, 5]] }, { name: "RB", log: [["2026-11-01", "WAS", 0, 95], ["2026-10-20", "NYG", 0, 200]] }],
    PHI: [{ name: "QB", log: [["2026-10-25", "WAS", 150, 15]] }],
  };
  assert.deepEqual(yardsAllowed("WAS", games, files, L, 2027), { pass: 200, rush: 57.5, n: 2 });
  assert.equal(yardsAllowed("WAS", games, {}, L, 2027), null);
});
