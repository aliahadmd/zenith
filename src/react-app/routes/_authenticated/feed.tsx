import { createFileRoute } from '@tanstack/react-router'
import { FeedPage } from '../../pages/FeedPage'

export const Route = createFileRoute('/_authenticated/feed')({
  component: FeedPage,
})
