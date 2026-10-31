import { createFileRoute } from '@tanstack/react-router'
import { More } from '@/features/more'

export const Route = createFileRoute('/_authenticated/more')({
  component: More,
})
