import { createFileRoute } from '@tanstack/react-router'
import { PostDetailPage } from '../../pages/PostDetailPage'

export const Route = createFileRoute('/_authenticated/u/$username_/post/$slug')({
  component: PostDetailRoute,
})

function PostDetailRoute() {
  const { username, slug } = Route.useParams()
  return <PostDetailPage username={username} slug={slug} />
}
