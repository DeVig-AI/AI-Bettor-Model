// The computer score pill (web/public/pill-core.js): same notes as the TV launcher, held back by the stream delay.
import test from 'node:test'
import assert from 'node:assert/strict'
import { Dock, Notes, parseFeed, touchdown, fieldGoal, shortClock, syncDelay, lastLeg } from '../../web/public/pill-core.js'

const game = (o) => ({key: 'nba:1', sport: 'nba', away: 'DET', home: 'MIA', as: 0, hs: 0, state: 'in', detail: '6:12 - 3rd', mine: 1, ...o})
const feed = (games, bets = [], settings = {}) => ({settings: {delay: 0, ...settings}, games, bets})

test('play text: touchdowns and field goals read like the TV', () => {
  assert.equal(touchdown('(10:21 - 2nd) (Shotgun) J.Allen pass short right to D.Kincaid for 12 yards, TOUCHDOWN.'), 'Allen to Kincaid, 12 yds')
  assert.equal(touchdown('J.Cook up the middle for 3 yards, TOUCHDOWN.'), 'Cook 3-yd run')
  assert.equal(touchdown('T.Tagovailoa pass INTERCEPTED by X, TOUCHDOWN'), 'Pick-six')
  assert.equal(touchdown('J.Cook for 3 yards'), null)
  assert.equal(fieldGoal('T.Bass 47 yard field goal is GOOD, Center-R.Ferguson.'), 'Bass from 47')
  assert.equal(shortClock('NBA', '6:12 - 3rd'), 'Q3 6:12')
  assert.equal(shortClock('CBB', '0:45 - 2nd'), 'H2 0:45')
  assert.equal(shortClock('NBA', 'Halftime'), 'Half')
})

test('basketball: lead change, runs, one-possession late', () => {
  const n = new Notes()
  assert.deepEqual(n.game('g', 'NBA', 'DET', 'MIA', 50, 52, 54, 52, '6:00 - 3rd', null, 0), ['DET takes the lead'])
  assert.deepEqual(n.game('g', 'NBA', 'DET', 'MIA', 54, 52, 58, 52, '5:00 - 3rd', null, 1e5), ['DET on an 8–0 run'])
  const m = new Notes()
  assert.deepEqual(m.game('h', 'NBA', 'DET', 'MIA', 90, 95, 92, 95, '2:14 - 4th', null, 0), ['One-possession game · Q4 2:14'])
  assert.deepEqual(m.game('h', 'NBA', 'DET', 'MIA', 92, 95, 94, 95, '2:00 - 4th', null, 1), [], 'said once')
})

test('football: touchdown then the extra point', () => {
  const n = new Notes()
  assert.deepEqual(n.game('f', 'NFL', 'BUF', 'MIA', 0, 0, 6, 0, '', 'J.Allen pass to D.Kincaid for 12 yards, TOUCHDOWN', 0), ['BUF touchdown · Allen to Kincaid, 12 yds'])
  assert.deepEqual(n.game('f', 'NFL', 'BUF', 'MIA', 6, 0, 7, 0, '', null, 3e4), ['BUF extra point good'])
  assert.deepEqual(n.game('f', 'NFL', 'BUF', 'MIA', 7, 0, 10, 0, '', null, 6e5), ['BUF field goal'])
})

test('props, last leg and sync math', () => {
  const n = new Notes()
  assert.equal(n.prop('p', 'Herro', 'pts', 'yes', 23.5, 20, 22, 'live', 0), 'Herro 22 pts · 2 to go')
  assert.equal(n.prop('p', 'Herro', 'pts', 'yes', 23.5, 22, 23, 'live', 1000), null, 'not again right away')
  assert.equal(n.prop('q', 'Brunson', 'ast', 'no', 7.5, 4, 5, 'live', 0), 'Brunson 5 ast · 2.5 under the line')
  assert.equal(lastLeg(2, 1, 0, 'MIA to win'), '1 leg left · MIA to win')
  assert.equal(lastLeg(2, 1, 1, 'MIA to win'), null)
  assert.equal(syncDelay(40_000, 10_000, 5_000), 32)
  assert.equal(syncDelay(1_000_000, 10_000, 5_000), -1)
})

test('the stream delay holds a score back until the stream shows it', () => {
  const d = new Dock({delay: 30})
  d.add(parseFeed(feed([game({as: 50, hs: 52})]), 0)); d.step(30_000)
  assert.equal(d.view(30_000, 30_000).game.as, 50)
  d.add(parseFeed(feed([game({as: 53, hs: 52})]), 35_000))
  d.step(50_000)
  assert.equal(d.view(50_000, 50_000).game.as, 50, 'not yet: the stream is 30s behind')
  d.step(65_000)
  const v = d.view(65_000, 65_000)
  assert.equal(v.game.as, 53)
  assert.equal(v.note, 'DET takes the lead')
  assert.equal(v.fresh, true)
})

test('a leg that hits, the last leg, the bet that lands', () => {
  const leg = (state, note = '') => ({label: 'Herro 20+ pts', kind: 'prop', state, note, game: 'nba:1'})
  const bet = (legs, o = {}) => ({id: 'p:a', label: '2-leg parlay', n: 2, won: legs.filter((l) => l.state === 'won').length, lost: 0, pays: 50, legs, ...o})
  const d = new Dock({delay: 0})
  d.add(parseFeed(feed([game()], [bet([leg('live'), {...leg('live'), label: 'MIA to win', kind: 'game'}])]), 0)); d.step(0)
  d.add(parseFeed(feed([game()], [bet([leg('won', '22'), {...leg('live'), label: 'MIA to win', kind: 'game'}])]), 5000)); d.step(5000)
  let v = d.view(5000, 5000)
  assert.equal(v.toast.text, 'Herro 20+ pts hit · 22')
  assert.equal(v.note, '1 leg left · MIA to win')
  assert.deepEqual(v.bet, {text: '1 to go', tone: 'gold'})
  d.add(parseFeed(feed([game({state: 'post'})], [bet([leg('won'), {...leg('won'), label: 'MIA to win', kind: 'game'}], {done: 'won'})]), 10_000)); d.step(10_000)
  assert.deepEqual(d.toasts.map((t) => t.text), ['Herro 20+ pts hit · 22', '🎉 2-leg parlay hit'])
})

test('"I just saw a score" before the feed has it: the stream is ahead, so nothing waits', () => {
  let saved = null
  const d = new Dock({delay: 30, onAhead: (x) => { saved = x }})
  d.add(parseFeed(feed([game({as: 50})]), 0))
  assert.equal(d.sync(10_000), -1)
  d.add(parseFeed(feed([game({as: 52})]), 20_000))
  assert.equal(d.delay(), 0)
  assert.equal(saved, 0)
  assert.equal(d.toasts[0].text, 'Your stream is ahead of the scores')
})

test('two of my games live take turns on the pill', () => {
  const d = new Dock({delay: 0})
  d.add(parseFeed(feed([game(), game({key: 'nba:2', away: 'NYK', home: 'BOS'})]), 0)); d.step(0)
  assert.equal(d.view(0, 0).game.away, 'DET')
  assert.equal(d.view(8_000, 8_000).game.away, 'NYK')
})
