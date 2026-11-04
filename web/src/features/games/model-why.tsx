import { type GameRow, fmtAmerican, fmtPct, impliedProb } from '@/lib/devig'
import { type Level } from '@/lib/experience'
import { type DevigFile, type LabFile, type LabGame, checkText } from '@/lib/lab'
import { cn } from '@/lib/utils'
import { inTen } from '../props/words'
import { Box, FactorList } from './explain-sheet'

// A game with no DeVig pick, explained at the reader's level: DeVig's CBB or NHL ratings model when it has a number,
// else the Lab's (NHL, CFB; new, not proven), else what Kalshi's price says.
// CBB v1's number splits exactly: margin = home court (if not neutral) + weight x rating gap, chance = logistic(a + b x
// margin) (tools/cbb_model_live.py). The Lab's CFB model publishes its margin (home_line) and the fit that turns it
// into a chance (tools/lab_live.py), so both show their steps. NHL files carry only the chance.

type Side = 'away' | 'home'

const HOW: Record<string, string> = {
  NHL: "Team ratings built from every result since 2022, who played the night before, and each team's recent share of the shots. Starting goalies aren't in it.",
  CBB: "One rating per team, built from every Division I final since 2011 and moved after each game by the margin, plus home court. No injuries, lineups or prices go in.",
  CFB: "A rating for every team from its scores, adjusted for who it played, then nudged by how well each offense has scored and moved the ball per play lately (blowout garbage time left out). No injuries or prices go in.",
}

// the same, in a sentence someone new can follow
const PLAIN: Record<string, string> = {
  NHL: "It rates every team from its results this season and last, who played the night before, and who has been getting more of the shots.",
  CBB: "It rates every team from its results, moving each rating after every game by how much it won or lost by.",
  CFB: "It rates every team from its scores, adjusted for who it played, and from how well its offense has scored per play lately.",
}
// what a $10 bet wins (profit) at these American odds, fee included
const win10 = (o: number) => (o > 0 ? o / 10 : 1000 / -o)
const money = (x: number) => `$${x >= 100 ? Math.round(x) : x.toFixed(2).replace(/\.00$/, '')}`

const one = (x: number) => (Math.round(x * 10) / 10).toFixed(1)
const signed = (x: number, d = 1) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d)
const line = (x: number) => (x > 0 ? `+${one(x)}` : x < 0 ? `−${one(-x)}` : 'pick’em').replace('.0', '')
const pts = (x: number) => {
  const r = Math.round(Math.abs(x))
  return r === 0 ? 'less than a point' : `about ${r} point${r === 1 ? '' : 's'}`
}

export function NoModelBody({ row, side, level, labGame, labFile, devigGame, devigFile }: {
  row: GameRow; side: Side; level: Level
  labGame: LabGame | null; labFile: LabFile | null | undefined
  devigGame: LabGame | null; devigFile: DevigFile | null | undefined
}) {
  const home = side === 'home'
  const code = home ? row.home : row.away
  const oppCode = home ? row.away : row.home
  const name = (home ? row.homeName : row.awayName) || code
  const opp = (home ? row.awayName : row.homeName) || oppCode
  const forSide = (h: number) => (home ? h : 1 - h)
  const fair = row.fairHome == null ? null : forSide(row.fairHome)
  const odds = home ? row.ml?.home : row.ml?.away
  const breakEven = impliedProb(odds ?? null)

  const g = devigGame ?? labGame
  const isDevig = !!devigGame
  if (!g) {
    return (
      <div className='flex flex-col gap-4'>
        <p className='text-[15px] leading-relaxed'>
          DeVig doesn&apos;t have a model for this {row.sport} game, so there&apos;s no &quot;why&quot; from DeVig here. This is what the price says.
        </p>
        {fair != null && <PriceLine name={name} fair={fair} odds={odds} level={level} breakEven={breakEven} />}
      </div>
    )
  }

  const prob = forSide(g.home_wp)
  const who = isDevig ? `DeVig's ${row.sport} model` : `The DeVig Lab's ${row.sport} model`
  const Who = isDevig ? `DeVig ${row.sport}` : `Lab ${row.sport}`
  const otherP = isDevig && labGame ? forSide(labGame.home_wp) : null
  const status = isDevig
    ? "It's new this season and graded on the Models page."
    : `The Lab found it by searching past seasons. It isn't one of DeVig's picks. ${checkText(labFile?.check)}`
  const diff = fair == null ? null : prob - fair
  const value = breakEven != null && prob > breakEven
  // the side's expected margin: CBB splits into rating and home court; CFB and CBB both publish the total
  const margin = g.home_line == null ? null : home ? -g.home_line : g.home_line
  const W = isDevig ? devigFile?.model.weights : undefined
  const split = row.sport === 'CBB' && W && g.parts
    ? { rating: (home ? 1 : -1) * W.m * g.parts.m, court: g.neutral ? 0 : (home ? 1 : -1) * W.home, gap: g.parts.m, W }
    : null
  const homeCode = row.home
  // Kalshi's spread for the home team, before the game only: once it starts the spread is a live line, and the
  // model's margin is still the pregame one
  const mkt = row.state === 'pre' ? row.spread?.home_point ?? null : null
  const mktSide = mkt == null ? null : home ? mkt : -mkt // the side's line: negative = favored by that many
  const through = (isDevig ? devigFile?.data_through : labFile?.data_through) ?? null
  const finals = (isDevig ? devigFile?.finals_used : labFile?.finals_used) ?? null

  const when = row.state === 'pre' ? null : (
    <p className='rounded-xl bg-muted px-3 py-2 font-sans text-sm text-muted-foreground'>
      {row.state === 'post'
        ? 'This game is over. The model\u2019s number is what it said before the game.'
        : "The game is on, so Kalshi's price is a live price and the model's pregame number is getting old."}
    </p>
  )

  if (level === 'new') {
    const reasons: string[] = []
    if (split) {
      reasons.push(
        Math.abs(split.rating) < 0.5
          ? `${name} and ${opp} have played about the same this season, so the model rates them close to even.`
          : split.rating > 0
            ? `${name} has played better this season: the model rates it ${pts(split.rating)} better than ${opp} on a neutral floor.`
            : `${opp} has played better this season: the model rates it ${pts(-split.rating)} better than ${name} on a neutral floor.`
      )
      reasons.push(
        g.neutral
          ? 'The game is on a neutral floor, so neither team gets a home boost.'
          : home
            ? `${name} is at home, which is worth ${pts(split.court)} in college basketball.`
            : `${opp} is at home, which is worth ${pts(-split.court)} to it in college basketball.`
      )
    } else {
      reasons.push(PLAIN[row.sport] ?? 'It rates every team from its past results.')
    }
    if (margin != null) {
      reasons.push(
        Math.abs(margin) < 0.5
          ? 'Put together, it expects a coin-flip game decided by a point or two.'
          : margin > 0
            ? `Put together, it expects ${name} to win by ${pts(margin)}.`
            : `Put together, it expects ${name} to lose by ${pts(-margin)}.`
      )
    }
    if (margin != null && mktSide != null && Math.abs(margin + mktSide) >= 1) {
      reasons.push(
        `Kalshi's spread has ${name} ${line(mktSide)}. The model would set it near ${line(-margin)}, so it thinks ${
          margin + mktSide > 0 ? `${name} is getting more points than it needs` : `${name} is giving away too many points`
        }.`
      )
    }
    const pre = row.state === 'pre'
    return (
      <div className='flex flex-col gap-4'>
        {when}
        <p className='text-lg leading-snug font-semibold'>
          {who} gives {name} <span className='text-devig'>{inTen(prob)}</span> ({fmtPct(prob)}).
        </p>
        <ul className='flex flex-col gap-3'>
          {reasons.map((r) => <li key={r} className='text-[15px] leading-relaxed'>{r}</li>)}
        </ul>
        {fair != null && diff != null && (
          <div className='rounded-2xl bg-muted p-3.5'>
            <p className='font-semibold'>What the price says</p>
            <p className='mt-1 text-sm leading-relaxed text-muted-foreground'>
              Kalshi&apos;s {pre ? '' : 'live '}price gives {name} {fmtPct(fair)}.{' '}
              {!pre
                ? `Before the game the model said ${fmtPct(prob)}, but the live price has moved with the score since, so the two can't be compared now.`
                : Math.abs(diff) < 0.01
                ? 'That’s about what the model thinks too.'
                : diff < 0
                  ? `That's more than the model's ${fmtPct(prob)}, so a bet on ${name} pays less than the model thinks it should.`
                  : `That's less than the model's ${fmtPct(prob)}, so the model thinks the price is generous.`}
            </p>
          </div>
        )}
        {odds != null && breakEven != null && (
          <div className='rounded-2xl bg-muted p-3.5'>
            <p className='font-semibold'>What a bet pays</p>
            <p className='mt-1 text-sm leading-relaxed text-muted-foreground'>
              At {fmtAmerican(odds)}, $10 on {name} wins {money(win10(odds))}. That&apos;s only worth it if {name} wins at least{' '}
              {fmtPct(breakEven)} of the time. {pre ? 'The model says' : 'Before the game, the model said'} {fmtPct(prob)}.
            </p>
          </div>
        )}
        {breakEven != null && (
          <p className={cn('font-semibold', value && pre ? 'text-good' : 'text-muted-foreground')}>
            {!pre
              ? "Bottom line: the live price knows the score and the model doesn't, so go by the price now."
              : value
                ? `Bottom line: the model thinks ${name} wins more often than this price needs.`
                : `Bottom line: the model thinks ${name} wins less often than this price needs, so it wouldn't bet ${name} here.`}
          </p>
        )}
        <p className='text-xs text-muted-foreground'>{isDevig ? 'The model is new this season and not proven. Nothing is bet.' : 'The model is new and not proven, and not a DeVig pick. Nothing is bet.'}</p>
      </div>
    )
  }

  if (level === 'sometimes') {
    const fs: { title: string; detail: string; favors: string | null; plain: string }[] = []
    if (split) {
      fs.push({
        title: 'Team rating',
        detail: Math.abs(split.rating) < 0.5 ? 'About even on a neutral floor' : `${split.rating > 0 ? code : oppCode} ${one(Math.abs(split.rating))} pts better on a neutral floor`,
        favors: Math.abs(split.rating) < 0.5 ? null : split.rating > 0 ? code : oppCode,
        plain: '',
      })
      fs.push({
        title: 'Home court',
        detail: g.neutral ? 'Neutral floor' : `${homeCode} at home, worth ${one(split.W.home)} pts`,
        favors: g.neutral ? null : homeCode,
        plain: '',
      })
    }
    if (margin != null) {
      fs.push({
        title: 'Expected margin',
        detail: Math.abs(margin) < 0.5 ? 'A pick’em' : `${margin > 0 ? code : oppCode} by ${one(Math.abs(margin))}`,
        favors: Math.abs(margin) < 0.5 ? null : margin > 0 ? code : oppCode,
        plain: '',
      })
    }
    if (margin != null && mktSide != null) {
      const gap = margin + mktSide // model margin vs the market's: >0 means the model likes this side more
      fs.push({
        title: 'Kalshi spread',
        detail: `Kalshi ${code} ${line(mktSide)} · model ${code} ${line(-margin)} (${one(Math.abs(gap))} pts apart)`,
        favors: Math.abs(gap) < 0.5 ? null : gap > 0 ? code : oppCode,
        plain: '',
      })
    }
    return (
      <div className='flex flex-col gap-4'>
        {when}
        <div className='flex items-baseline justify-between gap-3'>
          <span className='font-display text-3xl font-black text-devig'>{Who} {fmtPct(prob)}</span>
          {fair != null && <span className='font-display text-2xl font-extrabold'>Kalshi {fmtPct(fair)}{row.state === 'in' ? ' live' : ' now'}</span>}
        </div>
        {fs.length > 0 ? <FactorList row={row} fs={fs} /> : (
          <p className='text-[15px] leading-relaxed'>{HOW[row.sport] ?? 'Team ratings built from past results.'}</p>
        )}
        <div className='rounded-2xl bg-muted p-3.5'>
          <p className='font-semibold'>How it gets there</p>
          <p className='mt-1 text-sm leading-relaxed text-muted-foreground'>
            {HOW[row.sport] ?? 'Team ratings built from past results.'} {status}
            {otherP != null && ` The DeVig Lab's model says ${fmtPct(otherP)}.`}
          </p>
        </div>
        {breakEven != null && (
          <p className={cn('font-semibold', row.state !== 'pre' ? 'text-muted-foreground' : value ? 'text-good' : 'text-bad')}>
            At {fmtAmerican(odds)} you need {fmtPct(breakEven)} to break even.{' '}
            {row.state === 'pre'
              ? `The model says ${fmtPct(prob)}, ${Math.abs((prob - breakEven) * 100).toFixed(1)} points ${value ? 'above' : 'below'}: ${value ? 'worth it at this price.' : 'skip at this price.'}`
              : `The model said ${fmtPct(prob)} before the game; the live price has moved with the score since.`}
          </p>
        )}
      </div>
    )
  }

  // numbers
  const fit = isDevig ? devigFile?.model.win_chance : labFile?.win_chance_fit
  const a = fit ? ('a' in fit ? fit.a : fit.intercept) : null
  const b = fit ? ('b' in fit ? fit.b : fit.per_point) : null
  const homeMargin = g.home_line == null ? null : -g.home_line
  const search = !isDevig ? labFile?.candidate.search : undefined
  return (
    <div className='flex flex-col gap-4 font-condensed tabular-nums'>
      {when}
      <table className='w-full border-collapse text-sm'>
        <caption className='pb-1 text-start font-sans text-xs font-semibold text-muted-foreground'>
          How the number is built ({isDevig ? devigFile?.model.name ?? row.sport : labFile?.candidate.name ?? 'Lab model'}), home team {homeCode}
        </caption>
        <tbody>
          {split && (
            <>
              <Row label='Rating gap (home − away)' value={`${signed(split.gap, 2)} pts`} />
              <Row label={`× rating weight ${split.W.m.toFixed(3)}`} value={`${signed(split.W.m * split.gap)} pts`} />
              <Row label='Home court' value={g.neutral ? '0.0 (neutral)' : `${signed(split.W.home)} pts`} />
            </>
          )}
          {homeMargin != null && <Row label='Expected home margin' value={`${signed(homeMargin)} pts`} strong />}
          {g.home_line != null && <Row label='Model spread' value={`${homeCode} ${g.home_line > 0 ? '+' : ''}${one(g.home_line)}`} />}
          {mkt != null && <Row label='Kalshi spread' value={`${homeCode} ${mkt > 0 ? '+' : ''}${mkt}`} />}
          {a != null && b != null && homeMargin != null && (
            <Row label={`Chance = 1 / (1 + e^−(${a.toFixed(3)} + ${b.toFixed(3)} × margin))`} value={fmtPct(g.home_wp, 1)} strong />
          )}
        </tbody>
      </table>
      <div className='grid grid-cols-3 gap-1.5'>
        <Box label={`Model ${code}`} value={fmtPct(prob, 1)} amber />
        <Box label={row.state === 'in' ? 'Kalshi live' : 'Kalshi now'} value={fmtPct(fair, 1)} sub={odds != null ? fmtAmerican(odds) : undefined} />
        <Box label='Break-even' value={fmtPct(breakEven, 1)} />
      </div>
      <dl className='grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm'>
        <dt className='text-muted-foreground'>Model − Kalshi</dt>
        <dd className={cn('text-end font-semibold', (diff ?? 0) >= 0 ? 'text-good' : 'text-bad')}>{diff == null ? '—' : `${signed(diff * 100)} pts`}</dd>
        {otherP != null && (
          <>
            <dt className='text-muted-foreground'>Lab model</dt>
            <dd className='text-end'>{fmtPct(otherP, 1)}</dd>
          </>
        )}
        {search && (
          <>
            <dt className='text-muted-foreground'>Search result</dt>
            <dd className='text-end'>{signed(search.effect, 2)} pts a game, {search.games.toLocaleString()} games, t = {search.t.toFixed(2)}</dd>
          </>
        )}
        {!isDevig && (
          <>
            <dt className='text-muted-foreground'>Lab check</dt>
            <dd className='text-end'>{(labFile?.check?.state ?? 'waiting').replace(/_/g, ' ')}</dd>
          </>
        )}
        {(through || finals != null) && (
          <>
            <dt className='text-muted-foreground'>Results used</dt>
            <dd className='text-end'>{[finals != null ? `${finals.toLocaleString()} finals` : null, through ? `through ${through}` : null].filter(Boolean).join(', ')}</dd>
          </>
        )}
      </dl>
      <p className='font-sans text-xs leading-relaxed text-muted-foreground'>
        Fair chance splits Kalshi&apos;s two prices in proportion. Break-even uses Kalshi&apos;s price with its fee.
        Not proven to beat market prices.
      </p>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr className='border-t'>
      <td className='py-1.5'>{label}</td>
      <td className={cn('text-end', strong && 'font-bold text-foreground')}>{value}</td>
    </tr>
  )
}

function PriceLine({ name, fair, odds, level, breakEven }: { name: string; fair: number; odds: number | null | undefined; level: Level; breakEven: number | null }) {
  return (
    <p className='text-sm leading-relaxed text-muted-foreground'>
      Kalshi&apos;s price{odds != null ? ` (${fmtAmerican(odds)})` : ''} gives {name} {fmtPct(fair, level === 'numbers' ? 1 : 0)} once its fee gap is
      split off. That&apos;s the market&apos;s guess, not DeVig&apos;s.
      {level !== 'new' && breakEven != null && ` You need ${fmtPct(breakEven, level === 'numbers' ? 1 : 0)} to break even at that price.`}
    </p>
  )
}
