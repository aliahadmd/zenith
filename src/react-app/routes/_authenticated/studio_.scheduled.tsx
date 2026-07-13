import { createFileRoute, redirect } from '@tanstack/react-router'
import { StudioScheduledPage } from '../../pages/StudioScheduledPage'

export const Route = createFileRoute('/_authenticated/studio_/scheduled')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'creator') throw redirect({ to: '/become-creator', replace: true })
  },
  component: StudioScheduledPage,
})
