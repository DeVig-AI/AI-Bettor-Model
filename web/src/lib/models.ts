// The model comparison (live/models_export.json, MODELS_V1): DeVig's models next to open-source models other people
// publish, graded here on the same games with the same rules, Kalshi's price as the baseline. And which model the app
// uses per sport (live/champions_export.json, CHAMPION_CHALLENGER_V1).
import { useQuery } from '@tanstack/react-query'

const RAW = 'https://raw.githubusercontent.com/DeVig-AI/AI-Bettor-Model/main/'

export type ModelRow = {
  key: string; name: string; n?: number; w?: number; l?: number; push?: number; pct?: number | null
  profit?: number | null; roi?: number | null; breakeven?: number | null; none?: boolean; bar_only?: boolean
}
export type CloseRow = { key: string; name: string; n: number; beat: number; same: number; avg: number | null }
export type CalibRow = {
  key: string; name: string; n: number; logloss: number; mkt_logloss: number
  bins: { lo: number; hi: number; n: number; said: number; won: number }[]
}
export type SportReport = {
  ml?: ModelRow[]; spread?: ModelRow[]; total?: ModelRow[]; props?: ModelRow[]
  close?: CloseRow[]; calib?: CalibRow[]; props_calib?: CalibRow[]
}
export type ModelInfo = { key: string; name: string; sports: string[]; author: string; url: string; license: string; note: string }
export type Report = { tracking_since?: string; sports: Record<string, SportReport>; models: ModelInfo[] }
export type Slot = {
  champion: string; since?: string; hold?: string
  trial: { challenger: string; previous: string; start: string; games?: number; target: number } | null
  challengers: { id: string; games: number; needed: number }[]
}

const tick = () => Math.floor(Date.now() / 60000)

export function useModels() {
  return useQuery({
    queryKey: ['models'],
    queryFn: async () => {
      const [m, c] = await Promise.all([
        fetch(`${RAW}live/models_export.json?t=${tick()}`).then((r) => (r.ok ? r.json() : { docs: [] })),
        fetch(`${RAW}live/champions_export.json?t=${tick()}`).then((r) => (r.ok ? r.json() : { docs: [] })).catch(() => ({ docs: [] })),
      ])
      const docs = (m.docs || []) as { collection: string; data: Record<string, unknown> }[]
      const report = (docs.find((d) => d.collection === 'models_report')?.data ?? null) as Report | null
      const slots = ((c.docs || [])[0]?.data?.slots ?? {}) as Record<string, Slot>
      return { report, slots }
    },
    refetchInterval: 15 * 60e3,
  })
}
