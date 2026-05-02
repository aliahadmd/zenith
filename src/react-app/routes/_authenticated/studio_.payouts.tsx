import { createFileRoute, redirect } from '@tanstack/react-router'
import { PayoutsPage } from '../../pages/PayoutsPage'

export const Route = createFileRoute('/_authenticated/studio_/payouts')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'creator') {
      throw redirect({ to: '/become-creator', replace: true })
    }
  },
  component: PayoutsPage,
})
