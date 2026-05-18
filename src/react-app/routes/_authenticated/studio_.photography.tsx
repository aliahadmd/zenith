import { createFileRoute, redirect } from '@tanstack/react-router'
import { StudioPhotographyPage } from '../../pages/StudioPhotographyPage'

export const Route = createFileRoute('/_authenticated/studio_/photography')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'creator') {
      throw redirect({ to: '/become-creator', replace: true })
    }
  },
  component: StudioPhotographyPage,
})
