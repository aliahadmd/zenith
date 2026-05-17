import { createFileRoute } from '@tanstack/react-router'
import { AudioDetailPage } from '../../pages/AudioDetailPage'

export const Route = createFileRoute('/_authenticated/u/$username_/audio/$slug')({
  component: RouteComponent,
})

function RouteComponent() {
  const { username, slug } = Route.useParams()
  return <AudioDetailPage username={username} slug={slug} />
}
