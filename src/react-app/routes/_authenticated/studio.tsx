import { createFileRoute, redirect } from '@tanstack/react-router'
import { StudioPage } from '../../pages/StudioPage'

export const Route = createFileRoute('/_authenticated/studio')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'creator') {
      throw redirect({ to: '/become-creator', replace: true })
    }
  },
  component: StudioPage,
})
