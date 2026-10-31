import { createFileRoute } from '@tanstack/react-router'
import { TrackRecord } from '@/features/track-record'

export const Route = createFileRoute('/_authenticated/track-record')({
  component: TrackRecord,
})
