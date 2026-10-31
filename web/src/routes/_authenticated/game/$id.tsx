import { createFileRoute } from '@tanstack/react-router'
import { GamePage } from '@/features/game'

export const Route = createFileRoute('/_authenticated/game/$id')({
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  const { id } = Route.useParams()
  return <GamePage id={id} />
}
