import { createFileRoute, redirect } from '@tanstack/react-router'
import { SubscriptionsPage } from '../../pages/SubscriptionsPage'

export const Route = createFileRoute('/_authenticated/studio_/subscriptions')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'creator') {
      throw redirect({ to: '/become-creator', replace: true })
    }
  },
  component: SubscriptionsPage,
})
