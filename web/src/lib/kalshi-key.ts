// Your Kalshi key for building a parlay as one Kalshi combo, iPhone app only. The key itself never reaches this page:
// the app makes it (or reads the one Kalshi made straight off the clipboard, natively), keeps the secret half in the iPhone Keychain behind Face ID, and signs only "build this combo"
// (mobile/native/ios/App/DeVigKalshiPlugin.swift). This page sees just the public half and the Key ID, neither secret.
import { useCallback, useEffect, useState } from 'react'
import type { Leg } from './parlay'

type Bridge = { getPlatform?: () => string; nativePromise?: (plugin: string, method: string, opts: object) => Promise<unknown> }
const bridge = (): Bridge | null => {
  const c = (window as unknown as { Capacitor?: Bridge }).Capacitor
  return c?.getPlatform?.() === 'ios' && typeof c.nativePromise === 'function' ? c : null
}
const call = <T,>(method: string, opts: object = {}) => bridge()!.nativePromise!('DeVigKalshi', method, opts) as Promise<T>
const why = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e))

// available: this app version has it (older installs don't); ready: key made and its Key ID saved
// source: 'kalshi' = the key Kalshi made, pasted in; 'made' = made on this iPhone
export type KeyState = { available: boolean; publicKey: string; keyId: string; ready: boolean; source: 'made' | 'kalshi' }
const NONE: KeyState = { available: false, publicKey: '', keyId: '', ready: false, source: 'made' }

let state: KeyState | null = null
const watchers = new Set<(s: KeyState) => void>()
function set(s: KeyState) {
  state = s
  watchers.forEach((w) => w(s))
}
async function refresh() {
  if (!bridge()) return set(NONE)
  try {
    const r = await call<{ hasKey: boolean; publicKey: string; keyId: string; source?: string }>('status')
    set({ available: true, publicKey: r.hasKey ? r.publicKey : '', keyId: r.keyId, ready: r.hasKey && !!r.keyId, source: r.source === 'kalshi' ? 'kalshi' : 'made' })
  } catch {
    set(NONE) // the installed app is older than this
  }
}

export function useKalshiKey() {
  const [s, setS] = useState<KeyState>(state ?? NONE)
  useEffect(() => {
    watchers.add(setS)
    if (!state) refresh()
    return () => { watchers.delete(setS) }
  }, [])
  const makeKey = useCallback(async () => { await call('makeKey'); await refresh() }, [])
  // the app reads the clipboard itself and wipes it; the key never passes through this page
  const importKey = useCallback(async () => {
    try { await call('importKey') } catch (e) { throw new Error(why(e)) }
    await refresh()
  }, [])
  const saveKeyId = useCallback(async (keyId: string) => { await call('setKeyId', { keyId }); await refresh() }, [])
  const remove = useCallback(async () => { await call('remove'); await refresh() }, [])
  return { ...s, makeKey, importKey, saveKeyId, remove }
}

// a leg as Kalshi's combo builder takes it: a prop's over is Yes, its under No; a team to win is Yes on its market
export function comboLeg(l: Leg) {
  const t = l.ticker
  const parts = t ? t.split('-') : []
  if (!t || parts.length < 3) return null
  return { market_ticker: t, event_ticker: parts.slice(0, 2).join('-'), side: l.kind === 'prop' && l.id.endsWith('|under') ? 'no' : 'yes' }
}

// Face ID, then Kalshi builds the combo; returns the link that opens it on Kalshi with Yes picked, ready to buy
export async function buildCombo(legs: Leg[]): Promise<string> {
  const picked = legs.map(comboLeg)
  if (picked.some((x) => !x)) throw new Error('Every leg needs a Kalshi market')
  try {
    const r = await call<{ market_ticker: string }>('buildCombo', { legs: picked })
    const t = r.market_ticker
    const q = new URLSearchParams({ marketTicker: t, op_market_ticker: t, op_order_side: 'yes', op_side: 'BUY', op_order_type: 'dollars' })
    return `https://kalshi.com/combos?${q}`
  } catch (e) {
    throw new Error(why(e))
  }
}
