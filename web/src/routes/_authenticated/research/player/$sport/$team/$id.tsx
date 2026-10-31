import { createFileRoute } from '@tanstack/react-router'
import { ResearchPlayer } from '@/features/research/player'

type Search = { stat?: string; line?: number }

export const Route = createFileRoute('/_authenticated/research/player/$sport/$team/$id')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    stat: typeof s.stat === 'string' ? s.stat : undefined,
    line: s.line != null && !Number.isNaN(Number(s.line)) ? Number(s.line) : undefined,
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  const { sport, team, id } = Route.useParams()
  const { stat, line } = Route.useSearch()
  return <ResearchPlayer key={`${sport}${team}${id}${stat}${line}`} sport={sport.toUpperCase()} team={team.toUpperCase()} id={id} stat={stat} line={line} />
}
