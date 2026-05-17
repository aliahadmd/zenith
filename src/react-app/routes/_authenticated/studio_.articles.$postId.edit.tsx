import { createFileRoute, redirect } from '@tanstack/react-router'
import { ArticleEditorPage } from '../../pages/ArticleEditorPage'

export const Route = createFileRoute('/_authenticated/studio_/articles/$postId/edit')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'creator') {
      throw redirect({ to: '/become-creator', replace: true })
    }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { postId } = Route.useParams()
  return <ArticleEditorPage postId={postId} />
}
