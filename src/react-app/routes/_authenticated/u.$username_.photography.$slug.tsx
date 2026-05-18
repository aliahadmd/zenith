import { createFileRoute } from '@tanstack/react-router'
import { PhotographyAlbumPage } from '../../pages/PhotographyAlbumPage'

export const Route = createFileRoute('/_authenticated/u/$username_/photography/$slug')({
  component: RouteComponent,
})

function RouteComponent() {
  const { username, slug } = Route.useParams()
  return <PhotographyAlbumPage username={username} slug={slug} />
}
