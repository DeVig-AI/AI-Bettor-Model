import { createFileRoute } from '@tanstack/react-router'
import { Parlay } from '@/features/parlay'

export const Route = createFileRoute('/_authenticated/parlay')({
  component: Parlay,
})
