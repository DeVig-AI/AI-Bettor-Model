import { useEffect, useState } from 'react'

// ESPN's live status ("8:42 - 2nd", "45.2 - 4th") only changes when a new score arrives, so between refreshes the
// clock counts down on its own. It counts only once ESPN's clock has been seen moving (a new, lower time in the same
// period, and by no more than the time that passed, so a saved file's older time is not taken as the clock running), and for at most HOLD seconds after the last new time: past that the real clock has likely stopped
// (a timeout, a foul, an incomplete pass), so the screen shows ESPN's own time again. Baseball has no clock.

const HOLD = 15 // seconds of counting without a new time from ESPN
const RE = /^(?:(\d{1,2}):(\d{2})|(\d{1,2})(?:\.\d)?)(\s.*)?$/

type Seen = { detail: string; secs: number | null; rest: string; at: number; running: boolean }
const seen = new Map<string, Seen>()

export function parse(detail: string): { secs: number; rest: string } | null {
  const m = RE.exec(detail.trim())
  if (!m) return null
  const secs = m[1] != null ? +m[1] * 60 + +m[2] : +m[3]
  return { secs, rest: m[4] ?? '' }
}

function show(secs: number, rest: string) {
  const s = Math.max(0, Math.ceil(secs))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}${rest}`
}

function note(id: string, detail: string): Seen {
  const prev = seen.get(id)
  if (prev && prev.detail === detail) return prev
  const p = parse(detail)
  // an older answer from another server copy (a later time in the same period): keep the newer one
  if (p && prev && prev.secs != null && p.rest === prev.rest && p.secs > prev.secs && Date.now() - prev.at < 60e3) return prev
  const now = Date.now()
  const drop = p && prev && prev.secs != null && p.rest === prev.rest ? prev.secs - p.secs : 0
  const running = drop > 0 && drop <= (now - prev!.at) / 1000 + 3
  const next = { detail, secs: p?.secs ?? null, rest: p?.rest ?? '', at: now, running }
  seen.set(id, next)
  if (seen.size > 200) seen.delete(seen.keys().next().value!)
  return next
}

function ticking(s: Seen, now: number) {
  return s.running && s.secs != null && s.secs > 0 && now - s.at < HOLD * 1000
}

export function useGameClock(id: string, detail: string, live: boolean): string {
  const [now, setNow] = useState(() => Date.now())
  const s = live ? note(id, detail) : null
  const on = !!s && ticking(s, now)
  useEffect(() => {
    if (!on) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [on, detail])
  if (!s || s.secs == null) return detail
  if (!on) return s.detail
  return show(s.secs - Math.max(0, now - s.at) / 1000, s.rest)
}
