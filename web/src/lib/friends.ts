import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type TrackedParlay } from './track'
import { type Saved } from './kalshi-link'

// Friends (functions/api/friends.js): follow someone by their friend code and see their saved parlays, read-only.
// Sharing your own is off until you turn it on.

export type Friend = { code: string; name: string; share: boolean; parlays: TrackedParlay[]; saved?: Saved[]; gone?: boolean; following?: boolean }
export type FriendsData = { me: { code: string | null; share: boolean }; friends: Friend[] }

async function call<T>(method: 'GET' | 'POST', body?: unknown, qs = ''): Promise<T> {
  let r: Response
  try {
    r = await fetch(`/api/friends${qs}`, {
      method, credentials: 'same-origin',
      headers: body ? { 'content-type': 'application/json' } : { accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch { throw new Error('Offline, try again later.') }
  const d = await r.json().catch(() => null)
  if (!r.ok || !d) {
    const e = d?.error ? String(d.error) : `Friends aren't available here (${r.status})`
    throw Object.assign(new Error(e.charAt(0).toUpperCase() + e.slice(1) + '.'), { status: r.status })
  }
  return d as T
}

export const formatCode = (c: string) => `${c.slice(0, 5)}-${c.slice(5)}`.toUpperCase()
export const shareLink = (c: string) => `${location.origin}/v2/#/friends/${c}`

export function useFriends(enabled: boolean) {
  return useQuery({
    queryKey: ['friends'], queryFn: () => call<FriendsData>('GET'), enabled,
    staleTime: 60e3, refetchInterval: 5 * 60e3, retry: false,
  })
}

export function useFriend(code: string, enabled: boolean) {
  return useQuery({
    queryKey: ['friend', code], queryFn: async () => (await call<{ friend: Friend }>('GET', undefined, `?code=${encodeURIComponent(code)}`)).friend,
    enabled, staleTime: 60e3, retry: false,
  })
}

type Op = { op: 'share'; on: boolean } | { op: 'code' } | { op: 'follow'; code: string } | { op: 'unfollow'; code: string }
export function useFriendOp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (op: Op) => call<{ me: FriendsData['me']; following: string[] }>('POST', op),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['friends'] }); qc.invalidateQueries({ queryKey: ['friend'] }) },
  })
}

// a record from saved parlays that have settled: what was put in, what came back
export type Record_ = { hit: number; missed: number; staked: number; net: number; roi: number | null }
export function record(settled: { status: string; stake: number; payout: number }[]): Record_ {
  let hit = 0, staked = 0, net = 0
  for (const p of settled) {
    const s = Number(p.stake) || 0
    staked += s
    if (p.status === 'hit') { hit++; net += p.payout - s } else net -= s
  }
  return { hit, missed: settled.length - hit, staked, net, roi: staked > 0 ? net / staked : null }
}
