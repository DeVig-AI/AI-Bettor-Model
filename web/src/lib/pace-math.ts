// Prop pace, pure (no imports) so node tests can load it: where a player prop stands mid-game. "Usual by now" is the
// player's average over their last games, scaled to how much of their game is done: minutes played against the
// minutes they usually play when the box score has minutes (basketball, hockey ice time), else the game clock
// (football). The status compares what they have to where the line sits at that point. Display only: not a forecast.

export type PaceStatus = 'hit' | 'missed' | 'ahead' | 'behind' | 'on' | 'early'
export type Pace = {
  status: PaceStatus
  v: number // what they have
  target: number // what Yes needs (No needs target - 1 or fewer)
  usual: number | null // their usual by now (or for a whole game once it's over)
  need: number | null // how many more Yes needs; null once it's settled or for a No leg
  max: number // the bar's right edge: the line itself (more than the line still shows a full bar)
  mins: { now: number; usual: number } | null // minutes played tonight and usually, when the pace is by minutes
}

// a minutes value from a box score or game log: 28, "28", "17:32" (hockey ice time) -> minutes
export function minutesOf(x: unknown): number | null {
  if (typeof x === 'number') return Number.isFinite(x) ? x : null
  const t = String(x ?? '').trim()
  const m = /^(\d+):(\d{2})$/.exec(t)
  if (m) return +m[1] + +m[2] / 60
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : null
}

// seconds left in the period: ESPN's summary has only displayClock ("9:31"); the scoreboard also has clock (571)
export function clockSecs(status: { clock?: unknown; displayClock?: unknown } | null | undefined): number | null {
  if (typeof status?.clock === 'number') return status.clock
  const m = /^(\d+):(\d{2})(?:\.\d+)?$/.exec(String(status?.displayClock ?? status?.clock ?? '').trim())
  if (m) return +m[1] * 60 + +m[2]
  const s = parseFloat(String(status?.displayClock ?? '')) // under a minute: "38.2"
  return Number.isFinite(s) ? s : null
}

export const PACE_WORD: Record<PaceStatus, string> = { hit: 'Hit', missed: 'Missed', ahead: 'Ahead', behind: 'Behind', on: 'On pace', early: 'Early' }

// the average of up to `n` games (null under 3), each game's value the sum of the given log columns
export function usualOf(log: (string | number | null)[][], at: Record<string, number>, cols: string[], before: string, n = 15): number | null {
  if (!cols.length || cols.some((c) => at[c] == null)) return null
  const vals = log
    .filter((g) => String(g[at.date]) < before)
    .slice(0, n)
    .map((g) => cols.reduce((s, c) => s + Number(g[at[c]] ?? NaN), 0))
    .filter(Number.isFinite)
  return vals.length >= 3 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}

// played: share of the game clock played (0..1), or null once it's over. mins: minutes played tonight and the
// player's usual minutes; when both are known the pace goes by them instead of the clock (a player who sat 8 minutes
// of the first half has played less of their game than the clock says)
export function pace(v: number, target: number, side: 'yes' | 'no', avg: number | null, played: number | null,
  mins: { now: number | null; usual: number | null } | null = null): Pace {
  const final = played == null
  const byMins = !final && mins?.now != null && mins.usual != null && mins.usual > 0
  const share = final ? 1 : byMins ? Math.min(1, mins!.now! / mins!.usual!) : played
  const usual = avg == null ? null : Math.round(avg * share * 10) / 10
  const base = { v, target, usual, max: target || 1, mins: byMins ? { now: mins!.now!, usual: mins!.usual! } : null }
  const over = v >= target
  if (side === 'yes' && over) return { ...base, status: 'hit', need: null }
  if (side === 'no' && over) return { ...base, status: 'missed', need: null }
  if (final) return { ...base, status: side === 'yes' ? 'missed' : 'hit', need: null }
  const need = side === 'yes' ? target - v : null
  if (share < 0.2) return { ...base, status: 'early', need }
  // where the line sits by now; a little room either side counts as on pace (at least one of the stat)
  const by = target * share
  const room = Math.max(1, by * 0.15)
  const ahead = side === 'yes' ? v >= by + room : v <= by - room
  const behind = side === 'yes' ? v <= by - room : v >= by + room
  return { ...base, status: ahead ? 'ahead' : behind ? 'behind' : 'on', need }
}
