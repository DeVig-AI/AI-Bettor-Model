// Ask: questions about the picks, answered by the free AI behind /api/ask (signed-in accounts only, a daily cap per
// person; see functions/api/ask.js, which adds a general betting guide). The app sends its rules and what's on the
// board (games, Kalshi prices, DeVig's picks, the graded record, injuries) with the question, so the AI answers from
// DeVig's data and nothing else.
import { type GameRow, type SportRecord, impliedProb } from './devig'
import { type Injury } from './injuries'
import { type NflWhyGame } from '@/features/games/nfl-why'

export const ASK_RULES = [
  'You are the assistant inside DeVig, a sports odds app. The user is probably on a phone. Answer in plain, short language (a few sentences or a short list).',
  "Use ONLY the JSON data below for games, prices, picks, injuries and results. Never invent any. If something isn't in the data, say it isn't there.",
  "How to read it: prices are Kalshi's, as American odds with Kalshi's fee included. market_fair = Kalshi's chance for that side with the fee gap removed. devig_pick: action ML = DeVig's model picked a side and it cleared a tested confidence bar; PASS = not confident enough, no pick. devig_prob = the model's chance for its side. edge = devig_prob minus market_fair for that side. break_even = the win rate the current price needs.",
  'Accuracy from held-out testing on past seasons: NFL about 77% on the most confident quarter of picks vs about 66% overall; NBA 77.7% vs 63.5%; MLB 61.1% vs 55.9%. These are win rates, NOT profit.',
  "Be honest about money: none of DeVig's models has been proven to beat the betting odds. On past seasons the market's own prices were more accurate. Favorites win often but pay little. A bigger edge is where the model disagrees most with Kalshi, but that gap has not been proven profitable. The player props model was less accurate than Kalshi's prices.",
  "If a pick's break_even is higher than devig_prob, say the price is too steep: it loses money over time even if the model is right. For parlays: every leg adds Kalshi's fee, never put two legs from the same game together, and say a parlay is less likely than any one leg.",
  "Injuries are information only: DeVig's game models (except NFL Model 2.0) don't read them, and Kalshi's price may already include them.",
  "WHY THE MODEL SAYS WHAT IT SAYS: each game has model_reasoning, the model's own read. Use it whenever someone asks why the model likes, leans to or passed on a team, or why its chance is what it is. Explain from it, not from general betting talk.",
  "- model_reasoning.lean / lean_prob = the team the model favors and its chance, on picks and passes alike. pick_bar = how sure it must be to pick; a PASS means lean_prob was under pick_bar, not that the model has no view.",
  "- model_reasoning.steps (NFL Model 2.0) = how its number was built, exact and in order, as the lean team's chance after each step: home_field (two average teams, nobody hurt), then form (both teams' last 6 and 12 games: margin, record, EPA per play, rest), then who_is_out (= the final chance). Each step's change is what that part added or took away. Form is one total because those stats overlap; don't credit it to a single stat. what_it_read lists the stats themselves (EPA = expected points added per play, net = offense minus defense allowed; higher is better). injuries_vs counts are home minus away (positive = the home team is missing more).",
  "- model_reasoning.inputs (NBA) = what the model read for each team (last 10 games, rest, back-to-back). It doesn't say how much each moved the number, so say which side each favors, not how many points.",
  "- models[sport] = each model's own description of itself. If a game has no steps or inputs, say the model doesn't publish its reasons for that game.",
  "record = DeVig's graded picks this season by sport (won, lost, units at the locked price). Count from it; don't claim results that aren't in it.",
  'Say where each number comes from in a few words: (DeVig model), (Kalshi), (past test), (price math). Keep the data apart from general advice and label general advice as general.',
  'Never tell the user how much to bet, never claim certainty, and remind them to check the latest price and injury news before betting. You are not a financial advisor.',
].join('\n')

const r3 = (x: number | null | undefined) => (x == null ? null : Math.round(x * 1000) / 1000)

// The model's own read on one game, from its side: lean, the bar, and (NFL) the exact steps or (NBA) the inputs.
function reasoning(r: GameRow, why: Record<string, NflWhyGame> | undefined) {
  const p = r.pick
  if (!p) return null
  const side = p.side ?? p.lean
  const prob = p.side ? p.prob : p.leanProb
  const out: Record<string, unknown> = { lean: side, lean_prob: r3(prob), pick_bar: r3(p.bar) }
  const g = r.sport === 'NFL' ? why?.[r.trackKey] : undefined
  if (g && side && prob != null) {
    const f = (h: number) => r3(side === g.home ? h : 1 - h)
    // only when the breakdown is for the same number the app shows (it is rebuilt each model run)
    if (Math.abs((f(g.home_wp) ?? 0) - prob) < 0.006) {
      out.steps = { home_field: f(g.steps.home_field), form: f(g.steps.form), who_is_out: f(g.steps.who_is_out) }
      const r1 = (x: number | null | undefined) => (x == null ? null : Math.round(x * 10) / 10)
      const r2 = (x: number | null | undefined) => (x == null ? null : Math.round(x * 100) / 100)
      const t = (x: NflWhyGame['teams']['home']) => ({
        last6: { margin: r1(x.s6_margin), pts_for: r1(x.s6_pf), pts_against: r1(x.s6_pa), net_epa: r3(x.s6_net_epa), off_epa: r3(x.s6_off_epa), def_epa_allowed: r3(x.s6_def_epa_allowed) },
        last12: { margin: r1(x.s12_margin), win_rate: r2(x.s12_win), net_epa: r3(x.s12_net_epa) },
        rest_days: x.rest,
      })
      out.what_it_read = { [g.home]: t(g.teams.home), [g.away]: t(g.teams.away) }
      out.injuries_vs = { qb_out: g.injuries.d_qb, regulars_out: g.injuries.d_out, questionable: g.injuries.d_q }
    }
  }
  if (p.inputs) out.inputs = { model: p.inputs.model_version, [r.home]: p.inputs.home, [r.away]: p.inputs.away }
  return out
}

export function askContext(rows: GameRow[], records: SportRecord[], injuries: Injury[], why?: Record<string, NflWhyGame>) {
  const now = Date.now()
  const games = rows
    .filter((r) => r.state !== 'post' || now - Date.parse(r.kickoff) < 36 * 3600e3)
    .slice(0, 80)
    .map((r) => {
      const p = r.pick
      const pickOdds = p?.side == null ? null : p.side === r.home ? r.ml?.home : r.ml?.away
      const fairSide = p?.side == null || r.fairHome == null ? null : p.side === r.home ? r.fairHome : 1 - r.fairHome
      return {
        sport: r.sport,
        game: `${r.away} at ${r.home}`,
        teams: `${r.awayName} at ${r.homeName}`,
        kickoff: r.kickoff,
        state: r.state === 'pre' ? 'not started' : r.state === 'in' ? `live ${r.detail}` : 'final',
        score: r.awayScore == null ? null : `${r.away} ${r.awayScore}, ${r.home} ${r.homeScore}`,
        kalshi_odds: r.ml ? { [r.away]: r.ml.away, [r.home]: r.ml.home } : null,
        market_fair_home: r3(r.fairHome),
        spread: r.spread ? `${r.home} ${r.spread.home_point > 0 ? '+' : ''}${r.spread.home_point}` : null,
        total: r.total?.line ?? null,
        devig_pick: p
          ? {
              action: p.action,
              side: p.side,
              devig_prob: r3(p.prob),
              market_fair: r3(fairSide),
              edge: r3(r.edge),
              price_now: pickOdds ?? null,
              break_even: r3(pickOdds == null ? null : impliedProb(pickOdds)),
              locked_odds: p.lockedOdds,
              result: p.correct == null ? null : p.correct ? 'won' : 'lost',
            }
          : null,
        model_reasoning: reasoning(r, why),
      }
    })
  const record = records.map((s) => ({
    sport: s.sport,
    won: s.won,
    lost: s.lost,
    units: Math.round(s.units * 100) / 100,
    last_picks: s.picks.slice(0, 15).map((g) => `${g.kickoff.slice(0, 10)} ${g.away} at ${g.home}: ${g.side} ${g.won ? 'won' : 'lost'}${g.odds != null ? ` at ${g.odds > 0 ? '+' : ''}${Math.round(g.odds)}` : ''}`),
  }))
  const hurt = injuries
    .filter((x) => x.starter || /out|doubt/i.test(x.status))
    .slice(0, 60)
    .map((x) => `${x.sport} ${x.away} at ${x.home}: ${x.player} (${x.team}) ${x.status}${x.impact?.label ? `, ${x.impact.label} impact` : ''}`)
  const models: Record<string, string> = {}
  for (const r of rows) if (r.pick?.note && !models[r.sport]) models[r.sport] = r.pick.note
  return { now: new Date().toISOString(), models, games, record, injuries: hurt }
}

export type AskError = { code: string; partial: string }

export function askErrorText(code: string) {
  if (code === 'account') return 'account'
  if (code === 'rate_limited') return 'Too many questions at once. Wait a moment and try again.'
  if (code === 'limit') return "That's today's questions for your account. More tomorrow."
  if (code === 'quota') return 'The free AI has used up its answers for today. Try again tomorrow.'
  if (code === 'off') return "Ask isn't switched on for this site yet."
  if (code === 'offline') return "You're offline. Try again when you're connected."
  if (code === 'cancelled') return ''
  return 'Something went wrong getting an answer. You can try again.'
}

// Sends the conversation and streams the answer back through onText. Throws {code, partial} on failure.
export async function ask(messages: { role: 'user' | 'assistant'; content: string }[], signal: AbortSignal, onText: (t: string) => void) {
  let r: Response
  try {
    r = await fetch('/api/ask', {
      method: 'POST', credentials: 'same-origin', signal,
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages }),
    })
  } catch (e) {
    throw { code: (e as Error)?.name === 'AbortError' ? 'cancelled' : 'offline', partial: '' } as AskError
  }
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw { code: e.code || (r.status === 404 ? 'off' : 'ai'), partial: '' } as AskError
  }
  const reader = r.body!.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let text = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const d = line.slice(5).trim()
        if (!d || d === '[DONE]') continue
        try {
          const j = JSON.parse(d) // Workers AI {response} or OpenAI-style {choices:[{delta:{content}}]}
          const piece = j.response ?? j.choices?.[0]?.delta?.content
          if (piece) text += piece
        } catch { /* a partial line */ }
      }
      onText(text)
    }
  } catch (e) {
    throw { code: (e as Error)?.name === 'AbortError' ? 'cancelled' : 'ai', partial: text } as AskError
  }
  return text.trim()
}
