import { createFileRoute } from '@tanstack/react-router'
import { ArticleDetailPage } from '../../pages/ArticleDetailPage'

export const Route = createFileRoute('/_authenticated/u/$username_/article/$slug')({
  component: RouteComponent,
})

function RouteComponent() {
  const { username, slug } = Route.useParams()
  return <ArticleDetailPage username={username} slug={slug} />
}
