import { createFileRoute } from '@tanstack/react-router'
import { Ask } from '@/features/ask'

export const Route = createFileRoute('/_authenticated/ask')({
  component: Ask,
})
