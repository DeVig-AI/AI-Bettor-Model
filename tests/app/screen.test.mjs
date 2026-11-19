import { test } from 'node:test'
import assert from 'node:assert/strict'
import { american, pct, gameClock, clockText, boxRow, pace, foulTrouble, mark, betChance, hedge, tonight } from '../../web/public/screen-core.js'

const box = [{ team: 'NYK', labels: ['MIN', 'PTS', 'REB', 'AST', 'FG', '3PT', 'STL', 'BLK', 'TO', 'PF', '+/-'],
  rows: [{ name: 'Jalen Brunson', stats: ['30', '24', '3', '6', '9-17', '2-6', '1', '0', '2', '2', '+8'] },
    { name: 'Karl-Anthony Towns', stats: ['26', '14', '9', '2', '5-11', '1-3', '0', '1', '1', '4', '+3'] }] }]
const live = (detail, extra = {}) => ({ sport: 'nba', state: 'in', detail, away: 'NYK', home: 'BOS', as: 88, hs: 85, ...extra })

test('prices: American odds both ways, and percent', () => {
  assert.equal(american(0.6), '−150')
  assert.equal(american(0.4), '+150')
  assert.equal(american(null), '—')
  assert.equal(pct(0.714), '71%')
})

test('the game clock reads ESPN details: share gone, time left, late', () => {
  const q3 = gameClock('6:00 - 3rd Quarter', 'nba', 'in')
  assert.equal(q3.period, 3)
  assert.equal(q3.totalLeft, 18 * 60)
  assert.equal(q3.frac, 0.625)
  assert.equal(q3.late, false)
  assert.equal(gameClock('34.2 - 4th', 'nba', 'in').late, true)
  assert.equal(gameClock('Halftime', 'nba', 'in').frac, 0.5)
  assert.equal(gameClock('2:10 - OT', 'nba', 'in').frac, 1)
  assert.equal(gameClock('', 'nba', 'post').frac, 1)
  assert.equal(clockText(live('6:12 - 3rd Quarter')), 'Q3 6:12')
  assert.equal(clockText(live('Halftime')), 'Half')
  assert.equal(clockText({ ...live('1:12 - 2nd Half'), sport: 'cbb' }), 'H2 1:12')
})

test('a player is found in the box by name (accents, initials) with minutes, fouls and FG', () => {
  const r = boxRow(box, 'Jalen Brunson')
  assert.deepEqual([r.min, r.pts, r.pf, r.fg], [30, 24, 2, '9-17'])
  assert.equal(boxRow(box, 'Karl Anthony Towns').pf, 4)
  assert.equal(boxRow(box, 'Nobody Here'), null)
})

test('pace: stat per minute × likely minutes, capped, not before the game has gone far enough', () => {
  assert.equal(pace(24, 30, 0.625, 'nba'), 33.6)          // 30 min by 62.5% → 48 projected, capped at 42 → 0.8/min × 42
  assert.equal(pace(12, 20, 0.625, 'nba'), 19.2)          // 20 min → 32 projected
  assert.equal(pace(10, 10, 0.05, 'nba'), null)
  assert.equal(pace(20, 36, 1, 'nba'), 20)
})

test('foul trouble by league and period', () => {
  assert.equal(foulTrouble('nba', 4, 3), true)
  assert.equal(foulTrouble('nba', 4, 4), false)
  assert.equal(foulTrouble('nba', 5, 4), true)
  assert.equal(foulTrouble('nba', 3, 2), true)
  assert.equal(foulTrouble('wnba', 4, 4), true)
})

test('marks: hit, about to hit, close and at risk, each with a reason', () => {
  const g = live('6:00 - 3rd Quarter')
  const prop = (now, strike, extra = {}) => ({ state: 'live', kind: 'prop', stat: 'points', now, strike, side: 'yes', ...extra })
  assert.equal(mark({ state: 'won', kind: 'prop' }, g).st, 'hit')
  assert.deepEqual(mark(prop(27, 28.5), g, { box: boxRow(box, 'Jalen Brunson') }), { st: 'near', why: '2 away' })
  const ft = mark(prop(14, 19.5), g, { box: boxRow(box, 'Karl-Anthony Towns') })
  assert.equal(ft.st, 'risk')
  assert.match(ft.why, /4 fouls · may sit/)
  assert.equal(mark(prop(10, 29.5, { chance: 0.2 }), g).st, 'risk')
  assert.match(mark(prop(18, 24.5, { chance: 0.5 }), g, { was: 0.7 }).why, /market dropped/)
  assert.equal(mark(prop(18, 24.5, { chance: 0.9 }), g).st, 'near')
  // to win, one possession in the 4th
  const late = live('3:00 - 4th Quarter', { as: 100, hs: 99 })
  assert.equal(mark({ state: 'live', kind: 'game', team: 'NYK', chance: 0.6 }, late).st, 'close')
  assert.equal(mark({ state: 'live', kind: 'game', team: 'BOS', chance: 0.3 }, late).st, 'risk')
  assert.equal(mark({ state: 'live', kind: 'game', team: 'NYK', chance: 0.9 }, late).st, 'near')
  // over on a total running slow
  const slow = live('6:00 - 3rd Quarter', { as: 70, hs: 66 })
  const t = mark({ state: 'live', kind: 'total', strike: 230.5, side: 'yes' }, slow)
  assert.equal(t.st, 'risk')
  assert.match(t.why, /on pace for 217.6/)
  assert.equal(mark({ state: 'pre', kind: 'game', team: 'NYK' }, { ...g, state: 'pre' }).st, 'pre')
})

test('bet money: chance from the combo or the open legs, a hedge on the last team leg, tonight', () => {
  const b = { stake: 10, pays: 50, lost: 0, legs: [{ state: 'won', chance: 1 }, { state: 'live', kind: 'game', team: 'NYK', chance: 0.6 }] }
  assert.equal(betChance(b), 0.6)
  assert.equal(betChance({ ...b, chance: 0.55 }), 0.55)
  const hg = hedge(b)
  assert.deepEqual([hg.stake, hg.locked], [21, 19])
  assert.equal(hedge({ ...b, legs: [...b.legs, { state: 'live', kind: 'prop', chance: 0.5 }] }), null)
  const all = tonight([b, { stake: 5, pays: 20, legs: [{ state: 'live', chance: 0.5 }] }])
  assert.deepEqual([all.staked, all.all, all.worth], [15, 70, 40])
})
