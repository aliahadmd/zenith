import { createFileRoute, redirect } from '@tanstack/react-router'
import { BecomeCreatorPage } from '../../pages/BecomeCreatorPage'

export const Route = createFileRoute('/_authenticated/become-creator')({
  beforeLoad: ({ context }) => {
    if (context.user.role === 'creator') {
      throw redirect({ to: '/studio', replace: true })
    }
  },
  component: BecomeCreatorPage,
})
