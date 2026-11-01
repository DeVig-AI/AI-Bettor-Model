import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccount } from '@/lib/profile'

// DeVig alerts (functions/api/alerts.js): push notifications to this phone or computer, even with DeVig closed.
// The settings live on the account; each device that turns alerts on gets its own push subscription.

export type AlertPrefs = { picks: string[]; moves: boolean; lab: boolean; tz: string }
export type PriceTarget = {
  id: string; sport: string; gid: string; away: string; home: string; kickoff: string
  ticker: string; side: 'home' | 'away'; odds: number
}
export type ParlayAlert = {
  id: string; label: string; legs: { ticker: string; side: 'yes' | 'no'; label: string }[]
  at: number | null; from: number | null; settle: boolean
}
export type AlertState = {
  key: string; ready: boolean; prefs: AlertPrefs; targets: PriceTarget[]; parlays: ParlayAlert[]
  devices: { id: string; at: string; name: string }[]
}

// What this browser can do. iPhone and iPad only get web push in the app added to the Home Screen (iOS 16.4+).
export type Support = 'yes' | 'ios-install' | 'no'
export function support(): Support {
  if (typeof window === 'undefined') return 'no'
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  const can = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (ios && !standalone) return 'ios-install'
  return can ? 'yes' : 'no'
}

function deviceName() {
  const ua = navigator.userAgent
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac'
    : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Device'
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ''
  return br && os !== 'iPhone' && os !== 'iPad' ? `${os} · ${br}` : os
}
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'America/New_York' } }

function keyBytes(b64u: string) {
  const s = atob(b64u.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64u.length % 4)) % 4))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

async function call(body?: unknown): Promise<AlertState> {
  let r: Response
  try {
    r = await fetch('/api/alerts', body === undefined
      ? { credentials: 'same-origin', headers: { accept: 'application/json' } }
      : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  } catch { throw new Error('Offline, try again later.') }
  const d = await r.json().catch(() => ({}))
  if (!r.ok) {
    const msg = r.status === 429 ? (d.retry_ms ? 'One moment, then try again.' : "Today's save limit is reached.") : d.error || `alerts error ${r.status}`
    throw new Error(msg.charAt(0).toUpperCase() + msg.slice(1) + (/[.!]$/.test(msg) ? '' : '.'))
  }
  return d as AlertState
}

export function useAlerts() {
  const { data: acct } = useAccount()
  return useQuery({ queryKey: ['alerts'], queryFn: () => call(), enabled: acct?.state === 'joined', staleTime: 60_000, retry: false })
}

// this browser's own subscription, if alerts are on here
export function useThisDevice() {
  return useQuery({
    queryKey: ['alerts', 'device'],
    queryFn: async () => {
      if (support() !== 'yes') return null
      const reg = await navigator.serviceWorker.getRegistration('/')
      const sub = reg ? await reg.pushManager.getSubscription() : null
      return sub && Notification.permission === 'granted' ? sub.endpoint : null
    },
    staleTime: Infinity,
  })
}

function useSave<T>(fn: (v: T) => Promise<AlertState>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: (d) => qc.setQueryData(['alerts'], d) })
}

export function useTurnOn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (key: string) => {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') throw new Error(perm === 'denied'
        ? "Notifications are blocked for DeVig. Allow them in this browser's site settings, then try again."
        : 'Alerts need notification permission.')
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      // a subscription made with a different key can't receive DeVig's alerts: replace it
      const k = sub?.options?.applicationServerKey
      if (sub && k && btoa(String.fromCharCode(...new Uint8Array(k))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== key) {
        await sub.unsubscribe()
        sub = null
      }
      sub = sub || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) })
      const d = await call({ op: 'device', sub: sub.toJSON(), name: deviceName(), prefs: { tz: tz() } })
      return { d, endpoint: sub.endpoint }
    },
    onSuccess: ({ d, endpoint }) => { qc.setQueryData(['alerts'], d); qc.setQueryData(['alerts', 'device'], endpoint) },
  })
}

export function useTurnOff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (endpoint: string) => {
      const d = await call({ op: 'forget', endpoint })
      const reg = await navigator.serviceWorker.getRegistration('/')
      await (await reg?.pushManager.getSubscription())?.unsubscribe()
      return d
    },
    onSuccess: (d) => { qc.setQueryData(['alerts'], d); qc.setQueryData(['alerts', 'device'], null) },
  })
}

export const useSavePrefs = () => useSave((prefs: Partial<AlertPrefs>) => call({ op: 'prefs', prefs: { ...prefs, tz: tz() } }))
export const useSetTarget = () => useSave((target: Omit<PriceTarget, 'id'> & { id?: string }) => call({ op: 'target', target }))
export const useRemoveTarget = () => useSave((id: string) => call({ op: 'untarget', id }))
export const useSetParlay = () => useSave((parlay: ParlayAlert) => call({ op: 'parlay', parlay }))
export const useRemoveParlay = () => useSave((id: string) => call({ op: 'unparlay', id }))

export function useTest() {
  return useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/alerts', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{"op":"test"}' })
        .catch(() => null)
      const d = r ? await r.json().catch(() => ({})) : {}
      if (!r || !r.ok || !d.ok) throw new Error(d.error ? `${d.error.charAt(0).toUpperCase()}${d.error.slice(1)}.` : "The test didn't go through. Try turning alerts off and on.")
      return true
    },
  })
}

export const fmtOdds = (n: number) => (n > 0 ? `+${n}` : `${n}`)
