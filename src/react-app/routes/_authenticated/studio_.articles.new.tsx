import { createFileRoute, redirect } from '@tanstack/react-router'
import { ArticleEditorPage } from '../../pages/ArticleEditorPage'

export const Route = createFileRoute('/_authenticated/studio_/articles/new')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'creator') {
      throw redirect({ to: '/become-creator', replace: true })
    }
  },
  component: ArticleEditorPage,
})
