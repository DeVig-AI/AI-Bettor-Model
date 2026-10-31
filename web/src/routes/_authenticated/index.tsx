import { createFileRoute } from '@tanstack/react-router'
import { Games } from '@/features/games'

export const Route = createFileRoute('/_authenticated/')({
  component: Games,
})
