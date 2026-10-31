import { createFileRoute } from '@tanstack/react-router'
import { Injuries } from '@/features/injuries'

export const Route = createFileRoute('/_authenticated/injuries')({
  component: Injuries,
})
