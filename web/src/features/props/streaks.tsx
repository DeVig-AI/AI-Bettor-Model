import { useEffect, useMemo, useRef, useState } from 'react'
import { shareImage } from '@/lib/share-image'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Check, Plus, Share2 } from 'lucide-react'
import { useSlip } from '@/lib/parlay'
import { propLeg } from '../parlay/legs'
import { type GameRow, isSoccer } from '@/lib/devig'
import { type LivePrice, type PropLine, fetchLiveProps, overTxt } from '@/lib/props'
import { type RsIndex, type RsTeam, gameCode, logIdx, rsIndexQuery, statsCode, teamColor, useRsTeam } from '@/lib/research'
import { type Streak, type StreakPlayer, type StreakSummary, STREAK, streakLen, streakNote, streaks } from '@/lib/streak-math'
import { teamLogo } from '@/lib/logos'
import { TeamLogo } from '@/components/team-logo'

// Streaks: props each player reached in every one of their last 10 games, with Kalshi's price now (fee taken out).
// Counted from the stats bot's game logs; the note under the list says what past streaks did against the price
// (stats/props_streaks.json, tools/props_streak_history.py). Not a pick, and the section says so.
// Soccer: the match's goalscorer / assist markets from the soccer board, against each player's latest matches in every
// league and cup (stats/soccer, tools/stats_soccer.py), at the board's price (the live price endpoint is US sports only).

const RAW = 'https://raw.githubusercontent.com/DeVig-AI/AI-Bettor-Model/main/stats/props_streaks.json'
const SPORTS = ['NBA', 'NHL', 'NFL']
const timeFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const clockFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

export type Summary = { generated_at: string; sports: Record<string, StreakSummary> }
export function useStreakSummary() {
  return useQuery({
    queryKey: ['props_streaks'],
    queryFn: async () => {
      const r = await fetch(`${RAW}?t=${Math.floor(Date.now() / 6e5)}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return (await r.json()) as Summary
    },
    staleTime: 6e5,
  })
}

export type StreakRow = Streak<PropLine> & { k: number; lv?: LivePrice | null }

// Kalshi's live price, asked once for the streaks found; the price they were found at until it answers
function useLiveRows(found: Streak<PropLine>[]) {
  const [live, setLive] = useState<Record<string, LivePrice>>({})
  const [at, setAt] = useState<Date>(() => new Date())
  const asked = useRef(false)
  useEffect(() => {
    const ts = found.map((s) => s.l.ticker).filter(Boolean) as string[]
    if (asked.current || !ts.length) return
    asked.current = true
    fetchLiveProps(ts).then((m) => {
      if (!Object.keys(m).length) return
      setLive(m)
      setAt(new Date())
    })
  }, [found])
  const rows: StreakRow[] = useMemo(() => found.map((s) => {
    const lv = s.l.ticker ? live[s.l.ticker] : undefined
    const k = lv && lv.bid != null && lv.ask != null && lv.bid > 0 && lv.ask < 1 && lv.bid <= lv.ask ? (lv.bid + lv.ask) / 2 : s.mid
    return { ...s, k, lv: lv ?? null }
  }), [found, live])
  return { rows, at }
}

// One game's streaks, with Kalshi's live price asked once for what's found
export function useGameStreaks(ls: PropLine[]) {
  const g = ls[0]
  const sport = g?.sport ?? ''
  const ok = SPORTS.includes(sport)
  const idx = useQuery({ ...rsIndexQuery(sport), enabled: ok })
  const away = useRsTeam(sport, ok && g ? statsCode(sport, g.away) : '')
  const home = useRsTeam(sport, ok && g ? statsCode(sport, g.home) : '')
  const found = useMemo(() => {
    if (!ok || !idx.data || !g) return []
    const players: StreakPlayer[] = []
    for (const [t, code] of [[away.data, g.away], [home.data, g.home]] as const) {
      for (const p of t?.players ?? []) if (p.log?.length) players.push({ id: p.id, name: p.name, team: code, log: p.log })
    }
    return streaks(sport, ls, players, logIdx(idx.data), idx.data.hit_stats ?? [])
  }, [ok, idx.data, away.data, home.data, ls, sport, g])
  const { rows, at } = useLiveRows(found)
  const sum = useStreakSummary()
  const names: [string, string] = [away.data?.name || g?.away || '', home.data?.name || g?.home || '']
  return { rows, at, sport, names, unit: 'games', n: STREAK, soccer: false, loading: idx.isLoading || away.isLoading || home.isLoading, note: streakNote(sport, sum.data?.sports?.[sport]) }
}

// ---- soccer ----

const SOCCER_STATS = ['goal', 'ast', 'soa']
const soccerStats = <T,>(path: string) => fetch(`${RAW.replace('props_streaks.json', `soccer/${path}`)}?t=${Math.floor(Date.now() / 6e5)}`)
  .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<T> })

// one match's goalscorer / assist markets as prop lines (Kalshi's "n or more" is stored as n - 0.5, like the US props)
type SoccerPropLine = PropLine & { side: 'home' | 'away' }
export function soccerLines(row: GameRow): SoccerPropLine[] {
  const ps = row.soccer?.more?.players ?? []
  return ps.filter((p) => SOCCER_STATS.includes(p[2])).map(([side, player, kind, n, mid, ask, ticker]) => ({
    key: `${row.sport}|${row.trackKey}|${player}|${kind}|${n}`, sport: row.sport, gameKey: row.trackKey, away: row.away, home: row.home,
    kickoff: row.kickoff, player, stat: kind, line: n - 0.5, bid: ask == null ? null : 2 * mid - ask, ask, oi: 0, ticker,
    modelOver: null, expected: null, games: 0, injury: null, side,
  }))
}
export const soccerTxt = (stat: string, line: number) => {
  const n = line + 0.5
  if (stat === 'goal') return n === 1 ? 'Scores' : `${n}+ goals`
  if (stat === 'ast') return n === 1 ? 'Assist' : `${n}+ assists`
  return 'Goal or assist'
}

export function useSoccerStreaks(row: GameRow) {
  const ls = useMemo(() => soccerLines(row), [row])
  const on = ls.length > 0 && !!row.ids
  const idx = useQuery({ queryKey: ['rs_index', 'SOCCER'], queryFn: () => soccerStats<RsIndex>('index.json'), staleTime: 6e5, enabled: on })
  const team = (id?: string) => ({ queryKey: ['rs_team', 'SOCCER', id], queryFn: () => soccerStats<RsTeam>(`team_${id}.json`), staleTime: 6e5, enabled: on && !!id, retry: false })
  const away = useQuery(team(row.ids?.away))
  const home = useQuery(team(row.ids?.home))
  const found = useMemo(() => {
    if (!on || !idx.data) return []
    const players: StreakPlayer[] = []
    for (const [t, code] of [[away.data, row.away], [home.data, row.home]] as const) {
      for (const p of t?.players ?? []) if (p.log?.length) players.push({ id: p.id, name: p.name, team: code, log: p.log })
    }
    // a market's side says which club the player is on: two players with one name on the two clubs stay apart
    const side = (l: SoccerPropLine) => (l.side === 'away' ? row.away : row.home)
    const L = logIdx(idx.data), hit = idx.data.hit_stats ?? []
    const all = [row.away, row.home].flatMap((code) =>
      streaks('SOCCER', ls.filter((l) => side(l) === code), players.filter((p) => p.team === code), L, hit))
    // scoring every match already means a goal or an assist every match: that row adds nothing
    const scorers = new Set(all.filter((x) => x.l.stat === 'goal').map((x) => `${x.team}|${x.pid}`))
    return all.filter((x) => x.l.stat !== 'soa' || !scorers.has(`${x.team}|${x.pid}`))
      .sort((x, y) => y.mid - x.mid) // likeliest first, as the soccer markets list them
  }, [on, idx.data, away.data, home.data, ls, row])
  const { rows, at } = useLiveRows(found)
  const names: [string, string] = [row.awayName || row.away, row.homeName || row.home]
  return { rows, at, sport: row.sport, names, unit: 'matches', n: streakLen('SOCCER'), soccer: true, ls, loading: idx.isLoading || away.isLoading || home.isLoading, note: streakNote('soccer', undefined) }
}

function Bars({ s }: { s: StreakRow }) {
  const max = Math.max(...s.last, s.need, 1)
  return (
    <span aria-hidden='true' className='relative mt-1.5 flex h-[30px] w-[104px] items-end gap-[2px]'>
      {s.last.map((v, i) => <i key={i} className='flex-1 rounded-[2px] bg-devig' style={{ height: `${Math.max(6, (v / max) * 100)}%` }} />)}
      <b className='absolute -inset-x-[3px] h-0 border-t-[1.5px] border-foreground/90' style={{ bottom: `${(s.need / max) * 100}%` }} />
    </span>
  )
}

const lineTxt = (s: StreakRow) => (isSoccer(s.l.sport) ? soccerTxt(s.l.stat, s.l.line) : overTxt(s.l.stat, s.l.line))

function Row({ s, game, unit }: { s: StreakRow; game?: GameRow | null; unit: string }) {
  const side = game ? (s.team === game.away ? 'away' : 'home') : null
  const color = side && game?.colors ? game.colors[side] : null
  const label = lineTxt(s)
  const name = 'block truncate text-[15px] leading-tight font-bold'
  const { toggle, has } = useSlip()
  // the over on the streak line, before the game starts; soccer props don't go in parlays
  const leg = !isSoccer(s.l.sport) && Date.parse(s.l.kickoff) > Date.now() ? propLeg(s.l, 'over', s.lv ?? { bid: s.l.bid, ask: s.l.ask, title: null }) : null
  const on = leg ? has(leg.id) : false
  return (
    <li className='grid grid-cols-[28px_1fr_auto] items-center gap-2.5 border-t px-3.5 py-3 first:border-t-0'>
      <TeamLogo sport={s.l.sport} code={s.team} id={side ? game?.ids?.[side] : null} color={color} px={64} className='size-7 text-[9px]' />
      <span className='min-w-0'>
        {isSoccer(s.l.sport) ? <span className={name}>{s.l.player}</span> : (
          <Link to='/research/player/$sport/$team/$id' params={{ sport: s.l.sport, team: statsCode(s.l.sport, s.team), id: s.pid }}
            search={{ stat: s.l.stat, line: s.l.line }}
            className={`${name} underline decoration-muted-foreground/40 underline-offset-4 hover:text-devig`}>
            {s.l.player}
          </Link>
        )}
        <span className='block text-[13px] text-muted-foreground'>{label} · last {s.last.length}</span>
        <Bars s={s} />
        <span className='sr-only'>Last {s.last.length} {unit}, oldest first: {s.last.join(', ')}.</span>
      </span>
      <span className='text-end'>
        <span className='block font-display text-[26px] leading-none font-extrabold tabular-nums'>{s.last.length}/{s.last.length}</span>
        <span className='mt-1 inline-block text-[13px] text-muted-foreground'>Kalshi <strong className='text-foreground tabular-nums'>{Math.round(s.k * 100)}%</strong></span>
        {leg && (
          <button type='button' aria-pressed={on} onClick={() => toggle(leg)}
            aria-label={on ? `Take ${s.l.player} ${label} out of the parlay` : `Add ${s.l.player} ${label} to the parlay`}
            className={`mt-1.5 ml-auto flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-[12px] font-bold transition-colors ${on ? 'border-devig bg-devig/15 text-devig' : 'text-muted-foreground hover:text-foreground'}`}>
            {on ? <Check className='size-3.5' aria-hidden='true' /> : <Plus className='size-3.5' aria-hidden='true' />}
            {on ? 'In parlay' : 'Parlay'}
          </button>
        )}
      </span>
    </li>
  )
}

// The list, the note on past streaks, and the share button. limit: how many rows (the game page shows the top 4).
export type GameStreaks = ReturnType<typeof useGameStreaks> | ReturnType<typeof useSoccerStreaks>
export function StreakList({ data, ls, game, limit, className }: { data: GameStreaks; ls: PropLine[]; game?: GameRow | null; limit?: number; className?: string }) {
  const { rows, at, sport, note, loading, names, unit, n } = data
  const shown = limit ? rows.slice(0, limit) : rows
  if (!shown.length) {
    return limit ? null : (
      <p className='p-8 text-center text-muted-foreground'>
        {loading ? 'Counting streaks…' : `No player has hit one of these lines in each of their last ${n} ${unit}.`}
      </p>
    )
  }
  return (
    <div className={className}>
      <ul className='overflow-hidden rounded-[18px] bg-card'>
        {shown.map((s) => <Row key={s.l.key} s={s} game={game} unit={unit} />)}
      </ul>
      <p className='mx-0.5 mt-3 text-sm leading-relaxed text-muted-foreground'>
        Every one of these hit in each of the last {n} {unit}{data.soccer ? ' they played, in every league and cup' : ''}. {note[0]}{note[1] && <strong className='font-semibold text-foreground'>{note[1]}</strong>}{note[2]}
      </p>
      <ShareStreaks rows={rows.slice(0, 5)} game={game} sport={sport} at={at} ls={ls} names={names} unit={unit} n={n} />
    </div>
  )
}

// The game page's section: top 4, above the team links
export function Streaks({ ls, game }: { ls: PropLine[]; game: GameRow }) {
  const data = useGameStreaks(ls)
  if (!data.rows.length) return null
  return (
    <section aria-label='Streaks'>
      <div className='mb-1 flex items-baseline justify-between px-1'>
        <h2 className='font-display text-[22px] font-extrabold'>Streaks</h2>
        <span className='text-[13px] font-semibold text-devig'>Not a pick</span>
      </div>
      <p className='mb-2 px-1 text-sm text-muted-foreground'>Props each player has hit every game lately, with Kalshi&apos;s price now.</p>
      <StreakList data={data} ls={ls} game={game} limit={4} />
    </section>
  )
}

// The soccer match page's section: every streak (a match rarely has more than a few)
export function SoccerStreaks({ row }: { row: GameRow }) {
  const data = useSoccerStreaks(row)
  if (!data.rows.length) return null
  return (
    <section aria-labelledby='streaks-h' className='flex flex-col gap-2'>
      <div className='flex items-baseline justify-between px-1'>
        <h2 id='streaks-h' className='font-display text-[22px] font-extrabold'>Streaks</h2>
        <span className='text-[13px] font-semibold text-devig'>Not a pick</span>
      </div>
      <p className='px-1 text-sm text-muted-foreground'>Players who reached one of Kalshi&apos;s lines on this match in each of their last {data.n} matches, with Kalshi&apos;s price.</p>
      <StreakList data={data} ls={data.ls} game={row} />
    </section>
  )
}

// ---- the share image: drawn on a canvas (dark theme always) so it shares as a real image file from a phone ----

const C = { bg: '#0a0b0f', card: '#12151c', fg: '#f2f4f8', muted: '#9aa3b5', meta: '#cfd5e2', devig: '#ffb547', line: '#262b36' }
const F = { display: "'Big Shoulders Display', 'Barlow Semi Condensed', sans-serif", body: "'Barlow', sans-serif" }
const U = 390, K = 1080 / U // laid out in phone points, drawn at 1080 wide

function loadImg(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null)
  return new Promise((ok) => {
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => ok(im)
    im.onerror = () => ok(null)
    im.src = src
    setTimeout(() => ok(null), 4000)
  })
}
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = []
  let line = ''
  for (const w of text.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w
    if (ctx.measureText(t).width > max && line) { out.push(line); line = w } else line = t
  }
  if (line) out.push(line)
  return out
}

type Card = { rows: StreakRow[]; n: number; sport: string; meta: string; foot: string; cols: [string, string]; teams: [string, string]; ids: [string | null, string | null] }

async function drawCard(c: Card) {
  await Promise.all([`800 40px ${F.display}`, `700 15px ${F.body}`, `500 13px ${F.body}`].map((f) => document.fonts.load(f).catch(() => null)))
  const codes = [...new Set(c.rows.map((r) => r.team))]
  const logos = new Map(await Promise.all(codes.map(async (t) => {
    const i = t === c.teams[0] ? 0 : 1
    return [t, await loadImg(teamLogo(c.sport, t, c.ids[i], 128))] as const
  })))
  const m = document.createElement('canvas').getContext('2d')!
  m.font = `500 12px ${F.body}`
  const foot = wrap(m, c.foot, U - 40)
  const RH = 88, top = 176
  const H = Math.max(480, top + c.rows.length * RH + 24 + foot.length * 17 + 30) // one or two rows: no empty half-card

  const cv = document.createElement('canvas')
  cv.width = U * K
  cv.height = Math.round(H * K)
  const ctx = cv.getContext('2d')!
  ctx.scale(K, K)
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, U, H)

  // the two teams' colours on a diagonal, fading into the page
  ctx.save()
  ctx.globalAlpha = 0.6
  ctx.fillStyle = c.cols[0]
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(U * 0.55, 0); ctx.lineTo(U * 0.43, 230); ctx.lineTo(0, 230); ctx.fill()
  ctx.fillStyle = c.cols[1]
  ctx.beginPath(); ctx.moveTo(U * 0.57, 0); ctx.lineTo(U, 0); ctx.lineTo(U, 230); ctx.lineTo(U * 0.45, 230); ctx.fill()
  ctx.restore()
  const fade = ctx.createLinearGradient(0, 70, 0, 232)
  fade.addColorStop(0, 'rgba(10,11,15,0.15)')
  fade.addColorStop(1, C.bg)
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, U, 232)

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = C.devig
  ctx.font = `800 20px ${F.display}`
  ctx.fillText('DEVIG', 20, 44)
  ctx.fillStyle = C.fg
  ctx.font = `800 42px ${F.display}`
  ctx.fillText(`${c.n}-for-${c.n}`, 20, 100)
  ctx.fillText('streaks', 20, 138)
  ctx.fillStyle = C.meta
  ctx.font = `500 15px ${F.body}`
  ctx.fillText(fit(ctx, c.meta, U - 40), 20, 162)

  // the rows
  ctx.beginPath()
  ctx.roundRect(20, top, U - 40, c.rows.length * RH, 18)
  ctx.fillStyle = C.card
  ctx.fill()
  c.rows.forEach((s, i) => {
    const y = top + i * RH, x0 = 34, xr = U - 34
    if (i) { ctx.fillStyle = C.line; ctx.fillRect(20, y, U - 40, 1) }
    // logo on a white disc, or the code in the team's colour
    ctx.beginPath(); ctx.arc(x0 + 14, y + 30, 14, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill()
    const im = logos.get(s.team)
    if (im) ctx.drawImage(im, x0 + 3, y + 19, 22, 22)
    else {
      ctx.fillStyle = s.team === c.teams[0] ? c.cols[0] : c.cols[1]
      ctx.font = `800 10px ${F.display}`
      ctx.textAlign = 'center'
      ctx.fillText(s.team, x0 + 14, y + 34)
      ctx.textAlign = 'left'
    }
    const tx = x0 + 38
    ctx.textAlign = 'right'
    ctx.fillStyle = C.fg
    ctx.font = `800 26px ${F.display}`
    ctx.fillText(`${c.n}/${c.n}`, xr, y + 40)
    ctx.font = `700 13px ${F.body}`
    const kp = `${Math.round(s.k * 100)}%`
    ctx.fillText(kp, xr, y + 62)
    const kw = ctx.measureText(kp).width
    ctx.fillStyle = C.muted
    ctx.font = `500 13px ${F.body}`
    ctx.fillText('Kalshi ', xr - kw, y + 62)
    ctx.textAlign = 'left'
    const tw = xr - 70 - tx
    ctx.fillStyle = C.fg
    ctx.font = `700 15px ${F.body}`
    ctx.fillText(fit(ctx, s.l.player, tw), tx, y + 26)
    ctx.fillStyle = C.muted
    ctx.font = `500 13px ${F.body}`
    ctx.fillText(fit(ctx, `${lineTxt(s)} · last ${c.n}`, tw), tx, y + 43)
    // the bars, oldest first, and the line
    const max = Math.max(...s.last, s.need, 1), bw = (104 - 2 * (c.n - 1)) / c.n, by = y + 80, bh = 30
    ctx.fillStyle = C.devig
    s.last.forEach((v, j) => {
      const h = Math.max(0.06, v / max) * bh
      ctx.beginPath(); ctx.roundRect(tx + j * (bw + 2), by - h, bw, h, 2); ctx.fill()
    })
    ctx.fillStyle = C.fg
    ctx.fillRect(tx - 3, by - (s.need / max) * bh - 0.75, 110, 1.5)
  })

  ctx.fillStyle = C.muted
  ctx.font = `500 12px ${F.body}`
  let fy = top + c.rows.length * RH + 28
  for (const l of foot) { ctx.fillText(l, 20, fy); fy += 17 }
  return cv
}

function ShareStreaks({ rows, game, sport, at, ls, names, unit, n }: { rows: StreakRow[]; game?: GameRow | null; sport: string; at: Date; ls: PropLine[]; names: [string, string]; unit: string; n: number }) {
  const [blob, setBlob] = useState<Blob | null>(null)
  const g = ls[0]
  const card: Card = {
    rows, n, sport,
    meta: `${isSoccer(sport) ? `${names[1]} vs ${names[0]}` : `${names[0]} at ${names[1]}`} · ${timeFmt.format(new Date(g.kickoff))}`,
    foot: `Hit in each of the last ${n} ${unit}. Kalshi price with the fee taken out, ${clockFmt.format(at)}. Chances, not picks.`,
    cols: [game?.colors?.away ?? teamColor(sport, g.away), game?.colors?.home ?? teamColor(sport, g.home)],
    teams: [g.away, g.home], ids: [game?.ids?.away ?? null, game?.ids?.home ?? null],
  }
  const key = JSON.stringify([card.meta, card.foot, card.cols, rows.map((r) => [r.l.key, r.k])])
  // drawn ahead of the tap: iOS only opens the share sheet straight from a tap
  useEffect(() => {
    let gone = false
    setBlob(null)
    drawCard(card).then((cv) => cv.toBlob((b) => { if (!gone) setBlob(b) }, 'image/png')).catch(() => undefined)
    return () => { gone = true }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const share = () => { if (blob) shareImage(blob, `devig-streaks-${gameCode(sport, g.away)}-${gameCode(sport, g.home)}.png`.toLowerCase()) }
  return (
    <button type='button' onClick={share} disabled={!blob}
      className='mt-3 flex h-[46px] w-full items-center justify-center gap-2 rounded-full border text-[15px] font-semibold hover:bg-muted/50 disabled:opacity-50'>
      <Share2 className='size-[18px]' aria-hidden='true' />Share streaks
    </button>
  )
}
