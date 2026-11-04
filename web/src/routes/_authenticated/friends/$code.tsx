import { createFileRoute } from '@tanstack/react-router'
import { FriendPage } from '@/features/friends'

export const Route = createFileRoute('/_authenticated/friends/$code')({
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  const { code } = Route.useParams()
  return <FriendPage code={code} />
}
