import { createFileRoute } from '@tanstack/react-router'
import { ResearchTeam } from '@/features/research/team'
import { SoccerTeam } from '@/features/research/soccer-team'
import { isSoccer } from '@/lib/devig'

export const Route = createFileRoute('/_authenticated/research/team/$sport/$code')({
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  const { sport, code } = Route.useParams()
  const s = sport.toUpperCase()
  // soccer: the code is ESPN's team id (soccer team codes repeat across leagues)
  if (isSoccer(s)) return <SoccerTeam key={`${s}${code}`} sport={s} id={code} />
  return <ResearchTeam key={`${sport}${code}`} sport={s} code={code.toUpperCase()} />
}
