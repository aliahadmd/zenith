import { createFileRoute } from '@tanstack/react-router'
import { CourseDetailPage } from '../../pages/CourseDetailPage'

export const Route = createFileRoute('/_authenticated/u/$username_/course/$slug')({
  component: CourseRoute,
})

function CourseRoute() {
  const { username, slug } = Route.useParams()
  return <CourseDetailPage username={username} slug={slug} />
}
