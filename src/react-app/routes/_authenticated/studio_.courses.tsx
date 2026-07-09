import { createFileRoute } from '@tanstack/react-router'
import { CourseStudioPage } from '../../pages/CourseStudioPage'

export const Route = createFileRoute('/_authenticated/studio_/courses')({
  component: () => <CourseStudioPage courseId={null} />,
})
