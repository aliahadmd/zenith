import { createFileRoute } from '@tanstack/react-router'
import { AudioCollectionPage } from '../../pages/AudioCollectionPage'

export const Route = createFileRoute('/_authenticated/u/$username_/album/$slug')({
  component: RouteComponent,
})

function RouteComponent() {
  const { username, slug } = Route.useParams()
  return <AudioCollectionPage username={username} slug={slug} expectedKind="album" />
}
