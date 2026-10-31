import { createFileRoute } from '@tanstack/react-router'
import { Props } from '@/features/props'

export const Route = createFileRoute('/_authenticated/props')({
  component: Props,
})
