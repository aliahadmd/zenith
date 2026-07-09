import { createFileRoute } from '@tanstack/react-router'
import { CourseStudioPage } from '../../pages/CourseStudioPage'

export const Route = createFileRoute('/_authenticated/studio_/courses/$courseId/edit')({
  component: CourseEditRoute,
})

function CourseEditRoute() {
  const { courseId } = Route.useParams()
  return <CourseStudioPage courseId={courseId} />
}
