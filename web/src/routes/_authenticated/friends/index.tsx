import { createFileRoute } from '@tanstack/react-router'
import { Friends } from '@/features/friends'

export const Route = createFileRoute('/_authenticated/friends/')({
  component: Friends,
})
