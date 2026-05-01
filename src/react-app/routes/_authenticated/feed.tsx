import { createFileRoute, redirect } from '@tanstack/react-router'
import { FeedPage } from '../../pages/FeedPage'

export const Route = createFileRoute('/_authenticated/feed')({
  beforeLoad: ({ context }) => {
    if (context.user.role === 'creator') {
      throw redirect({ to: '/studio', replace: true })
    }
  },
  component: FeedPage,
})
