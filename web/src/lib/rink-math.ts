// The NHL rink's arithmetic, kept free of React (and of runtime imports) so node tests can run it: where a shot
// sits on the rink as drawn, short labels for ESPN's play text, the goals to replay and the shot counts. Plays come
// from functions/api/live.js nhlGame (newest first). Display only.

export type RinkPlay = {
  id: string
  team: string | null
  q: number | null
  clock: string
  text: string
  type: string
  scoring: boolean
  away_score: number | null
  home_score: number | null
  at?: number // unix seconds
  spot?: { x: number; y: number } // feet from centre ice, x toward the net the shooter attacks, y to the shooter's left
  penalty?: boolean
  pim?: number
  strength?: 'PP' | 'SH' | 'EN'
}

// The rink as drawn: 200 x 85 ft, left to right, the far boards at y 0. Away attacks the left net, home the right.
export const RINK = { w: 200, h: 85, goal: 11, blue: 75, r: 28 }
export function rinkSpot(spot: { x: number; y: number }, home: boolean): { x: number; y: number } {
  // a shooter heading right has their left toward the far boards (y 0)
  return home ? { x: 100 + spot.x, y: 42.5 - spot.y } : { x: 100 - spot.x, y: 42.5 + spot.y }
}

export const isShot = (p: RinkPlay) => p.type === 'Shot' || p.scoring
export const isGoal = (p: RinkPlay) => p.scoring && !/shootout/i.test(p.type)

// the goals to play on the rink: the newest `n`, oldest first
export function recentGoals(plays: RinkPlay[], n = 6): RinkPlay[] {
  return plays.filter(isGoal).sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, n).reverse()
}

// shots on goal (goals count as shots), per team
export function shotCounts(plays: RinkPlay[], away: string, home: string): { away: number; home: number } {
  const out = { away: 0, home: 0 }
  for (const p of plays) if (isShot(p)) { if (p.team === away) out.away++; else if (p.team === home) out.home++ }
  return out
}

const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv)$/i
export function lastName(full: string) {
  const w = full.trim().split(/\s+/)
  while (w.length > 1 && SUFFIX.test(w[w.length - 1])) w.pop()
  return w[w.length - 1] ?? full
}

// who set the goal up: "…, assists: Mikhail Sergachev (13), Clayton Keller (15)" -> ["Sergachev", "Keller"]
export function assistsOf(p: RinkPlay): string[] {
  const m = /assists?:\s*(.+)$/i.exec(p.text)
  if (!m) return []
  return m[1].split(/,\s*/).map((s) => s.replace(/\(\d+\)/g, '').trim()).filter((s) => s && !/^none$/i.test(s)).map(lastName)
}

// what kind of shot, in plain words: "snap shot", "backhand", "tip-in"
function shotKind(t: string) {
  const m = /(wrist shot|snap shot|slap shot|backhand|tip-in|deflected|wrap-around|poke|bat)/i.exec(t)
  return m ? m[1].toLowerCase() : null
}

const STRENGTH = { PP: 'power play', SH: 'shorthanded', EN: 'empty net' }

// ESPN's text cut to its gist:
//   "Dylan Guenther Goal (6) Snap Shot, assists: …" -> "Guenther goal, snap shot"
//   "Easton Cowan Wrist Shot saved by Sebastian Cossa" -> "Cowan wrist shot, saved"
//   "Liam O'Brien Hooking against Troy Stecher" -> "O'Brien hooking, 2 min"
export function rinkLabel(p: RinkPlay): string {
  const t = p.text.replace(/\s+/g, ' ').trim()
  let m: RegExpMatchArray | null
  if (p.scoring && (m = t.match(/^(.+?) Goal\b/i))) {
    const k = shotKind(t)
    return `${lastName(m[1])} goal${p.strength ? `, ${STRENGTH[p.strength]}` : k ? `, ${k}` : ''}`
  }
  if (p.penalty) {
    const pim = p.pim ? `, ${p.pim} min` : ''
    const i = p.type ? t.toLowerCase().indexOf(p.type.toLowerCase()) : -1
    if (i > 0) return `${lastName(t.slice(0, i))} ${p.type.toLowerCase()}${pim}`
    return t.replace(/\s*\(\d+ min\)/i, '') + pim
  }
  if ((m = t.match(/^(.+?) (wrist shot|snap shot|slap shot|backhand|tip-in|deflected|wrap-around|poke|bat)\b.*saved by/i)))
    return `${lastName(m[1])} ${m[2].toLowerCase()}, saved`
  return t.length > 44 ? t.slice(0, 42).trimEnd() + '…' : t.replace(/\.$/, '')
}

// "UTA 3 – TOR 2" after a play
export function scoreAfter(p: RinkPlay, away: string, home: string) {
  return p.away_score == null || p.home_score == null ? '' : `${away} ${p.away_score} – ${home} ${p.home_score}`
}
