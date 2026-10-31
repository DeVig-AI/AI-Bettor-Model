import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { type AskError, ASK_RULES, ask, askContext, askErrorText } from '@/lib/ask'
import { useGames, useRecord } from '@/lib/devig'
import { useInjuries } from '@/lib/injuries'
import { cn } from '@/lib/utils'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'

// Ask: plain-words questions about the board, answered by a free AI from DeVig's own data. Needs a free account
// (the server caps questions per person per day). Answers stream in; Stop cancels.

const CHIPS = [
  ['Best bets now', 'What are the best picks right now, and is the price worth it on each?'],
  ['What to avoid', 'Which picks should I be careful with, and why?'],
  ['Safest 2-leg parlay', 'Build the safest 2-leg parlay from the current picks and explain the risk.'],
  ['How has DeVig done?', 'How has DeVig actually done so far, by sport, in wins and units?'],
  ['Who is hurt?', 'Which injuries matter most for tonight’s games?'],
] as const

type Turn = { role: 'user' | 'assistant'; content: string }

export function Ask() {
  const { rows } = useGames()
  const { records } = useRecord()
  const injuries = useInjuries()
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [live, setLive] = useState<string | null>(null) // the answer streaming in
  const [err, setErr] = useState('')
  const ctl = useRef<AbortController | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const busy = live != null

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [turns, live])

  async function send(q: string) {
    q = q.trim()
    if (!q || busy) return
    setErr('')
    setDraft('')
    const ctx = `RULES:\n${ASK_RULES}\n\nAPP DATA (JSON):\n${JSON.stringify(askContext(rows, records, injuries.data ?? []))}`
    const past = turns.slice(-8)
    // the app's data rides on the first question of the conversation (the server keeps the last 12 messages)
    const msgs: Turn[] = past.length
      ? [{ role: 'user', content: `${ctx}\n\nQUESTION: ${past[0].content}` }, ...past.slice(1), { role: 'user', content: q }]
      : [{ role: 'user', content: `${ctx}\n\nQUESTION: ${q}` }]
    setTurns((t) => [...t, { role: 'user', content: q }])
    setLive('')
    ctl.current = new AbortController()
    try {
      const a = await ask(msgs, ctl.current.signal, setLive)
      setTurns((t) => [...t, { role: 'assistant', content: a }])
    } catch (e) {
      const x = e as AskError
      if (x.partial) setTurns((t) => [...t, { role: 'assistant', content: x.partial }])
      setErr(askErrorText(x.code))
    }
    setLive(null)
  }

  return (
    <>
      <Header>
        <div className='me-auto min-w-0'>
          <h1 className='font-display text-[26px] leading-none font-black'>Ask</h1>
          <p className='mt-0.5 truncate text-xs text-muted-foreground'>Questions about the picks, in plain words</p>
        </div>
        <ThemeSwitch />
      </Header>
      <Main className='mx-auto flex min-h-[calc(100svh-8rem)] w-full max-w-3xl flex-col gap-4 pb-0'>
        {turns.length === 0 && (
          <>
            <p className='rounded-2xl bg-card px-4 py-3 text-sm leading-relaxed'>
              Answers are written by a free AI from DeVig&apos;s picks, Kalshi&apos;s prices, the injury reports and the track record, plus general betting know-how. It&apos;s a guide, not a guarantee.
            </p>
            <div className='flex flex-wrap gap-2'>
              {CHIPS.map(([label, q]) => (
                <button key={label} type='button' onClick={() => send(q)} className='h-9 rounded-full border px-4 text-sm font-medium hover:border-foreground'>{label}</button>
              ))}
            </div>
          </>
        )}

        <div className='flex flex-col gap-3' aria-live='polite'>
          {turns.map((t, i) => (
            <div key={i} className={cn('max-w-[88%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap', t.role === 'user' ? 'self-end bg-devig text-devig-ink' : 'self-start bg-card')}>
              {t.content}
            </div>
          ))}
          {busy && (
            <div className='max-w-[88%] self-start rounded-2xl bg-card px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap'>
              {live || <span className='text-muted-foreground'>Thinking…</span>}
            </div>
          )}
          <div ref={end} />
        </div>

        {err === 'account' ? (
          <section className='rounded-2xl bg-accent p-4 text-sm leading-relaxed text-accent-foreground'>
            <p><b className='text-devig'>Ask needs a free account.</b> Sign in with your email (you get a code, no password). A new account needs the invite code once, in Profile in the classic app.</p>
            <a href='/login?next=/v2/' className='mt-3 inline-flex h-10 items-center rounded-full bg-devig px-4 font-bold text-devig-ink'>Sign in</a>
          </section>
        ) : err ? (
          <p role='alert' className='text-sm text-bad'>{err}</p>
        ) : null}
        {turns.length > 0 && !busy && (
          <button type='button' onClick={() => { setTurns([]); setErr('') }} className='self-start text-sm text-muted-foreground underline-offset-2 hover:underline'>Clear chat</button>
        )}
        <form
          onSubmit={(e) => { e.preventDefault(); send(draft) }}
          className='sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 -mx-4 mt-auto border-t bg-background px-4 py-3 md:bottom-0'
        >
          <div className='mx-auto flex max-w-3xl items-end gap-2'>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft) } }}
              rows={1}
              placeholder='Ask about a game, a pick, a parlay…'
              aria-label='Your question'
              className='max-h-32 min-h-11 flex-1 resize-none rounded-2xl border bg-card px-4 py-2.5 text-[16px] outline-none focus:border-foreground'
            />
            {busy ? (
              <button type='button' onClick={() => ctl.current?.abort()} aria-label='Stop' className='grid size-11 shrink-0 place-items-center rounded-full bg-foreground text-background'><Square className='size-4' /></button>
            ) : (
              <button type='submit' disabled={!draft.trim()} aria-label='Send' className='grid size-11 shrink-0 place-items-center rounded-full bg-devig text-devig-ink disabled:opacity-40'><ArrowUp className='size-5' /></button>
            )}
          </div>
          <p className='mx-auto mt-1.5 max-w-3xl text-[11px] text-muted-foreground'>AI can make mistakes, so double-check before betting.</p>
        </form>
      </Main>

    </>
  )
}
