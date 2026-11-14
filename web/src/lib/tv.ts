import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// DeVig on the TV (functions/api/tv.js): a private TV code links the living-room launcher's score dock to this
// account, and these settings decide what the dock shows. The code only reads open bets, ★ teams and scores.

export type TvSettings = {
  show: 'bets' | 'teams' | 'all'
  sports: string[]
  delay: number
  pos: 'corner' | 'bar'
  props: boolean
  lost: boolean
  close: boolean
  settled: boolean
  auto: boolean
  quiet: boolean
}
export type TvData = { code: string | null; settings: TvSettings }

export const TV_SPORTS = [['nfl', 'NFL'], ['nba', 'NBA'], ['cfb', 'CFB'], ['cbb', 'CBB'], ['nhl', 'NHL']] as const
export const TV_DELAYS = [0, 15, 30, 45, 60] as const

async function call<T>(method: 'GET' | 'POST', body?: unknown): Promise<T> {
  let r: Response
  try {
    r = await fetch('/api/tv', {
      method, credentials: 'same-origin',
      headers: body ? { 'content-type': 'application/json' } : { accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch { throw new Error('Offline, try again later.') }
  const d = await r.json().catch(() => null)
  if (!r.ok || !d) {
    const e = d?.error ? String(d.error) : `The TV dock isn't available here (${r.status})`
    throw Object.assign(new Error(e.charAt(0).toUpperCase() + e.slice(1) + '.'), { status: r.status })
  }
  return d as T
}

export const formatTvCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`.toUpperCase()

export function useTv(enabled: boolean) {
  return useQuery({ queryKey: ['tv'], queryFn: () => call<TvData>('GET'), enabled, staleTime: 5 * 60e3, retry: false })
}

type Op = { op: 'code' } | { op: 'off' } | { op: 'settings'; settings: TvSettings }
export function useTvOp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (op: Op) => call<TvData & { ok: true }>('POST', op),
    // settings change optimistically so toggles feel instant; the server's cleaned copy replaces them
    onMutate: (op) => {
      if (op.op !== 'settings') return
      const prev = qc.getQueryData<TvData>(['tv'])
      if (prev) qc.setQueryData<TvData>(['tv'], { ...prev, settings: op.settings })
      return { prev }
    },
    onError: (_e, _op, ctx) => { if (ctx?.prev) qc.setQueryData(['tv'], ctx.prev) },
    onSuccess: (d) => qc.setQueryData<TvData>(['tv'], { code: d.code, settings: d.settings }),
  })
}
