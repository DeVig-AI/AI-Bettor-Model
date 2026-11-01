import { createFileRoute } from '@tanstack/react-router'
import { Fair } from '@/features/fair'

export const Route = createFileRoute('/_authenticated/fair')({
  component: Fair,
})
