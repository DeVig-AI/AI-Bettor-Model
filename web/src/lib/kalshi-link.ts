// The Kalshi link reader: paste a link from Kalshi's Share button (one bet, a game, or a combo) and /api/kalshi
// (functions/api/kalshi.js) returns its prices now and, for a combo, every leg. Saved links live in this browser.
import { useMutation } from '@tanstack/react-query'
import type { Outcome, Snap } from './review'

export type KLeg = {
  ticker: string | null; event: string | null; title: string | null; pick: string; side: 'yes' | 'no'
  status: string | null; result: 'won' | 'lost' | null
  bid: number | null; ask: number | null; last: number | null; chance: number | null; closes: string | null
  strike?: number | null; strike_type?: string | null // 224.5 'greater' = 225+
}
export type KRead =
  | { kind: 'combo'; ticker: string; fetched_at: string; combo: KLeg; legs: KLeg[]; multiplied: number | null; won: number; lost: number; truncated: boolean }
  | { kind: 'market'; ticker: string; fetched_at: string; market: KLeg }
  | { kind: 'event'; ticker: string; fetched_at: string; title: string | null; sub: string | null; markets: KLeg[] }

export class LinkError extends Error {}

export async function readLink(link: string): Promise<KRead> {
  let r: Response
  try {
    r = await fetch(`/api/kalshi?link=${encodeURIComponent(link.trim())}`, { headers: { accept: 'application/json' } })
  } catch {
    throw new LinkError("Couldn't reach DeVig. Check your connection and try again.")
  }
  const d = await r.json().catch(() => null)
  if (!r.ok || !d) throw new LinkError(d?.error ?? "Kalshi isn't answering right now. Try again in a minute.")
  return d as KRead
}

export function useReadLink() {
  return useMutation({ mutationFn: readLink })
}

// what a leg says, in words: "BYU wins", or "No: Boston wins" for a No leg
export function legLabel(l: KLeg) {
  const t = l.title || l.pick
  return l.side === 'no' ? `No: ${t}` : t
}

// snap: the review as it stood when first read (legs still to play); outcome: how it ended (see lib/review.ts)
export type Saved = { link: string; label: string; savedAt: string; snap?: Snap; outcome?: Outcome }
const KEY = 'devig_saved_links'
export function loadSaved(): Saved[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v.filter((x) => x && typeof x.link === 'string').slice(0, 30) : []
  } catch {
    return []
  }
}
export function storeSaved(list: Saved[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 30))) } catch { /* private mode: kept for this visit only */ }
}
export function labelFor(d: KRead) {
  if (d.kind === 'combo') return `Combo, ${d.legs.length} legs`
  if (d.kind === 'market') return legLabel(d.market)
  return d.title || d.ticker
}
