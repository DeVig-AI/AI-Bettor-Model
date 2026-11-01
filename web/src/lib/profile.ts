import { useCallback, useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// Name tag and favorite teams. Same two localStorage keys as the classic app (same site, so both apps share them),
// and the same account copy through /api/me (docs/account.js does this for classic; this file does it for v2).
// Favorite teams are team codes per sport, e.g. {NBA: ['BOS'], NFL: ['KC']}, matching the games data.

const PREFS_KEY = 'devig.prefs.v1'
const TRACK_KEY = 'devig.tracked.v1'
const CHANGED = 'devig:prefs-changed'

export type Prefs = { name: string; teams: Record<string, string[]>; mode?: string; updated?: number }
type Tracked = { g: Record<string, number>; p: Record<string, number>; parlays?: Record<string, { removed?: number }>; updated?: number }

function read<T>(k: string): T | null {
  try { return JSON.parse(localStorage.getItem(k) || 'null') as T | null } catch { return null }
}
function write(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode: stays in memory for this visit */ }
}

const EMPTY: Prefs = { name: '', teams: {} }
let cacheRaw: string | null | undefined
let cache: Prefs = EMPTY
function snapshot(): Prefs {
  let raw: string | null = null
  try { raw = localStorage.getItem(PREFS_KEY) } catch { /* no storage */ }
  if (raw === cacheRaw) return cache
  cacheRaw = raw
  const p = read<Partial<Prefs>>(PREFS_KEY)
  cache = p && typeof p === 'object'
    ? { ...p, name: String(p.name || ''), teams: p.teams && typeof p.teams === 'object' ? p.teams : {} }
    : EMPTY
  return cache
}
function subscribe(cb: () => void) {
  window.addEventListener(CHANGED, cb)
  window.addEventListener('storage', cb)
  return () => { window.removeEventListener(CHANGED, cb); window.removeEventListener('storage', cb) }
}

export function savePrefs(next: Prefs) {
  write(PREFS_KEY, { ...next, updated: Date.now() }) // keeps fields classic owns (mode)
  window.dispatchEvent(new Event(CHANGED))
  push()
}

export function usePrefs() {
  const prefs = useSyncExternalStore(subscribe, snapshot, () => EMPTY)
  const update = useCallback((fn: (p: Prefs) => Prefs) => savePrefs(fn(snapshot())), [])
  return { prefs, update }
}

export function isFavorite(prefs: Prefs, sport: string, ...codes: string[]) {
  const f = prefs.teams[sport] ?? []
  return codes.some((c) => f.includes(c))
}

// ---------- the account ----------
export type Account =
  | { state: 'guest' }                         // not signed in
  | { state: 'invite'; email: string }         // signed in, the invite code not entered yet
  | { state: 'joined'; email: string }         // saved to the account
  | { state: 'device'; why: string | null }    // accounts aren't available here (setup, other host, offline)

let joinedEmail: string | null = null
let pushTimer: ReturnType<typeof setTimeout> | undefined
let syncNote = ''
const notes = new Set<() => void>()
function note(s: string) { syncNote = s; notes.forEach((f) => f()) }
export function useSyncNote() {
  return useSyncExternalStore((cb) => { notes.add(cb); return () => notes.delete(cb) }, () => syncNote, () => '')
}

// Two devices: everything tracked on either is kept; for name and teams the newer copy wins. (Same as classic.)
function merge(local: { tracked: Partial<Tracked>; prefs: Partial<Prefs> }, remote: { tracked?: Partial<Tracked>; prefs?: Partial<Prefs> }) {
  const lt = local.tracked || {}, rt = remote.tracked || {}
  const t: Tracked = { g: {}, p: {}, updated: Math.max(lt.updated || 0, rt.updated || 0) }
  for (const k of ['g', 'p'] as const) for (const src of [rt[k] || {}, lt[k] || {}]) Object.assign(t[k], src)
  const lp = lt.parlays || {}, rp = rt.parlays || {}
  if (Object.keys(lp).length || Object.keys(rp).length) {
    t.parlays = {}
    for (const src of [rp, lp]) for (const id of Object.keys(src)) if (!t.parlays[id] || src[id].removed) t.parlays[id] = src[id]
  }
  const a = local.prefs || {}, b = remote.prefs || {}
  let prefs: Partial<Prefs> = (a.updated || 0) > (b.updated || 0) ? a : b
  if (!prefs.teams) prefs = { name: a.name || b.name || '', teams: a.teams || b.teams || {}, updated: Date.now() }
  return { tracked: t, prefs }
}

function push(delay = 800) {
  if (!joinedEmail) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(async () => {
    try {
      const r = await fetch('/api/me', {
        method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tracked: read(TRACK_KEY) || {}, prefs: read(PREFS_KEY) || {} }),
      })
      if (r.status === 429) {
        const e = await r.json().catch(() => ({}))
        if (e.retry_ms) push(e.retry_ms + 200)
        else note("Today's save limit is reached; saved on this device for now.")
        return
      }
      note(r.ok ? 'Saved to your account.' : "Couldn't save to your account; saved on this device.")
    } catch {
      note('Offline: saved on this device, and it syncs next time.')
    }
  }, delay)
}

function start(email: string, data: { tracked?: Partial<Tracked>; prefs?: Partial<Prefs> } | null) {
  joinedEmail = email
  const local = { tracked: read<Partial<Tracked>>(TRACK_KEY) || {}, prefs: read<Partial<Prefs>>(PREFS_KEY) || {} }
  const m = data ? merge(local, data) : local
  write(TRACK_KEY, m.tracked)
  write(PREFS_KEY, m.prefs)
  window.dispatchEvent(new Event(CHANGED))
  note('Saved to your account.')
  push() // store the combined copy (the first sign-in uploads this device's)
}

const WHY: Record<number, string> = { 503: "accounts aren't switched on yet", 404: 'accounts only work on devigai.pages.dev' }

async function loadAccount(): Promise<Account> {
  let r: Response
  try { r = await fetch('/api/me', { credentials: 'same-origin', headers: { accept: 'application/json' } }) } catch { return { state: 'device', why: null } }
  if (r.status === 401) return { state: 'guest' }
  if (!r.ok) return { state: 'device', why: WHY[r.status] ?? `account error ${r.status}` }
  const d = await r.json().catch(() => null)
  if (!d || !d.email) return { state: 'device', why: null } // e.g. the preview server answering with a page
  if (!d.joined) return { state: 'invite', email: d.email }
  start(d.email, d.data)
  return { state: 'joined', email: d.email }
}

export function useAccount() {
  return useQuery({ queryKey: ['account'], queryFn: loadAccount, staleTime: Infinity, retry: false })
}

export function useJoin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ code, email }: { code: string; email: string }) => {
      let r: Response
      try {
        r = await fetch('/api/me', {
          method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ invite: code }),
        })
      } catch { throw new Error('Offline, try again later.') }
      const e = await r.json().catch(() => ({}))
      if (!r.ok) {
        throw new Error(r.status === 403
          ? `Wrong code${e.tries_left != null ? ` (${e.tries_left} ${e.tries_left === 1 ? 'try' : 'tries'} left)` : ''}.`
          : `${e.error ? e.error.charAt(0).toUpperCase() + e.error.slice(1) : "Couldn't check the code"}.`)
      }
      start(email, null)
      return email
    },
    onSuccess: (email) => qc.setQueryData<Account>(['account'], { state: 'joined', email } as Account),
  })
}

// Sign-in is Cloudflare Access on /login; it comes back here afterwards.
export const SIGN_IN = `/login?next=${encodeURIComponent('/v2/#/profile')}`
export const SIGN_OUT = '/cdn-cgi/access/logout'
