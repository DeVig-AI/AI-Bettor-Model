// Prop pace, pure (no imports) so node tests can load it: where a player prop stands mid-game. "Usual by now" is the
// player's average over their last games, scaled to how much of the game is played; the status compares what they
// have to where the line sits at this point of the game. Display only: a pace isn't a forecast.

export type PaceStatus = 'hit' | 'missed' | 'ahead' | 'behind' | 'on' | 'early'
export type Pace = {
  status: PaceStatus
  v: number // what they have
  target: number // what Yes needs (No needs target - 1 or fewer)
  usual: number | null // their usual by now (or for a whole game once it's over)
  need: number | null // how many more Yes needs; null once it's settled or for a No leg
  max: number // the bar's right edge
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

// played: share of the game played (0..1), or null once it's over
export function pace(v: number, target: number, side: 'yes' | 'no', avg: number | null, played: number | null): Pace {
  const final = played == null
  const usual = avg == null ? null : Math.round(avg * (final ? 1 : played) * 10) / 10
  const max = Math.max(target, v, usual ?? 0) * 1.15 || 1
  const base = { v, target, usual, max }
  const over = v >= target
  if (side === 'yes' && over) return { ...base, status: 'hit', need: null }
  if (side === 'no' && over) return { ...base, status: 'missed', need: null }
  if (final) return { ...base, status: side === 'yes' ? 'missed' : 'hit', need: null }
  const need = side === 'yes' ? target - v : null
  if (played < 0.2) return { ...base, status: 'early', need }
  // where the line sits by now; a little room either side counts as on pace (at least one of the stat)
  const by = target * played
  const room = Math.max(1, by * 0.15)
  const ahead = side === 'yes' ? v >= by + room : v <= by - room
  const behind = side === 'yes' ? v <= by - room : v >= by + room
  return { ...base, status: ahead ? 'ahead' : behind ? 'behind' : 'on', need }
}
