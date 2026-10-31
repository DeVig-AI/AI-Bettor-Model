import { createFileRoute } from '@tanstack/react-router'
import { Research } from '@/features/research'

export const Route = createFileRoute('/_authenticated/research/')({
  component: Research,
})
