// Saved bets (Kalshi links and DeVig slips, lib/kalshi-link.ts) on two devices: every one either has is kept, newest
// first; one removed on a device stays removed unless it's saved again after that. Kept free of runtime imports so
// node tests can run it; functions/api/me.js mergeLinks does the same on the server.

// bet: what you put in and what it pays if it hits, in dollars, as Kalshi shows them; `at` = when it was typed (the latest wins)
export type SavedBet = { stake: number; pays: number; at: number }
export type SavedItem = { link: string; label: string; savedAt: string; snap?: unknown; outcome?: unknown; bet?: SavedBet }
export type SavedSync = { items: SavedItem[]; gone: Record<string, number> }

export const MAX_SAVED = 30
const MAX_GONE = 100

export function mergeSaved(a: Partial<SavedSync> | null | undefined, b: Partial<SavedSync> | null | undefined): SavedSync {
  const gone: Record<string, number> = { ...(a?.gone || {}) }
  for (const [k, v] of Object.entries(b?.gone || {})) gone[k] = Math.max(gone[k] || 0, Number(v) || 0)
  const by = new Map<string, SavedItem>()
  for (const s of [...(a?.items || []), ...(b?.items || [])]) {
    if (!s || typeof s.link !== 'string') continue
    if ((gone[s.link] || 0) >= (Date.parse(s.savedAt) || 0)) continue // removed after it was saved
    const o = by.get(s.link)
    if (!o) { by.set(s.link, s); continue }
    // the same bet on both: the earlier save, its first-read snapshot and whichever copy knows how it ended
    const first = (Date.parse(o.savedAt) || 0) <= (Date.parse(s.savedAt) || 0) ? o : s
    const m: SavedItem = { ...first }
    const snap = o.snap ?? s.snap, outcome = o.outcome ?? s.outcome
    if (snap) m.snap = snap
    if (outcome) m.outcome = outcome
    const bet = (o.bet?.at ?? 0) >= (s.bet?.at ?? 0) ? o.bet : s.bet
    if (bet) m.bet = bet; else delete m.bet
    by.set(s.link, m)
  }
  const items = [...by.values()].sort((x, y) => (Date.parse(y.savedAt) || 0) - (Date.parse(x.savedAt) || 0)).slice(0, MAX_SAVED)
  const keys = Object.keys(gone).sort((x, y) => gone[x] - gone[y]).slice(-MAX_GONE)
  return { items, gone: Object.fromEntries(keys.map((k) => [k, gone[k]])) }
}

// whether the account's copy is missing something this device has (an account from before saved bets synced has none)
export function needsUpload(local: Partial<SavedSync> | null | undefined, remote: Partial<SavedSync> | null | undefined): boolean {
  const m = mergeSaved(local, remote)
  const r = mergeSaved(remote, null)
  const have = new Set(r.items.map((s) => s.link))
  return m.items.some((s) => !have.has(s.link)) || Object.keys(m.gone).some((k) => !(k in r.gone))
}
