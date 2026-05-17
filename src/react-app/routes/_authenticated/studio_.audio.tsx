import { createFileRoute, redirect } from '@tanstack/react-router'
import { StudioAudioPage } from '../../pages/StudioAudioPage'

export const Route = createFileRoute('/_authenticated/studio_/audio')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'creator') {
      throw redirect({ to: '/become-creator', replace: true })
    }
  },
  component: StudioAudioPage,
})
