import { createFileRoute } from '@tanstack/react-router'
import { ResearchTeam } from '@/features/research/team'

export const Route = createFileRoute('/_authenticated/research/team/$sport/$code')({
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  const { sport, code } = Route.useParams()
  return <ResearchTeam key={`${sport}${code}`} sport={sport.toUpperCase()} code={code.toUpperCase()} />
}
