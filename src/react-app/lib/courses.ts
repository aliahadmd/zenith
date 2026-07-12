import { queryOptions } from '@tanstack/react-query'
import { apiDeleteRequired, apiGetRequired, apiPatchRequired, apiPostRequired, apiPutRequired, ApiError } from './api'
import type { PostReply } from './posts'

export type CourseStatus = 'draft' | 'published'
export type LessonStatus = 'draft' | 'published'
export type CourseAttachmentKind = 'video' | 'audio' | 'file'

export type CourseAttachment = {
  id: string
  kind: CourseAttachmentKind
  fileName: string
  contentType: string
  sizeBytes: number
  displayOrder: number
  url: string
}

export type CourseLesson = {
  id: string
  title: string
  summary: string | null
  status: LessonStatus
  displayOrder: number
  publishedAt: number | null
  locked: boolean
  markdown: string | null
  attachments: CourseAttachment[]
  completed: boolean
}

export type CourseModule = {
  id: string
  title: string
  description: string | null
  displayOrder: number
  lessons: CourseLesson[]
}

export type CourseCreator = {
  id: string
  displayName: string
  username: string
  avatarUrl: string | null
}

export type CourseSummary = {
  id: string
  postId: string
  type: 'course'
  slug: string
  title: string
  description: string
  status: CourseStatus
  createdAt: number | null
  publishedAt: number | null
  updatedAt: number | null
  creator: CourseCreator
  modules?: CourseModule[]
  hasAccess?: boolean
  isOwner?: boolean
  progress?: {
    completedLessons: number
    totalLessons: number
  } | null
  likeCount: number
  replyCount: number
  viewerLiked: boolean
  viewerSaved: boolean
}

export type CourseDetailResponse = {
  course: CourseSummary
  replies?: PostReply[]
}

export type CreatorCoursesResponse = {
  courses: CourseSummary[]
  hasAccess: boolean
}

export const courseKeys = {
  mine: ['studio', 'courses'] as const,
  detail: (username: string, slug: string) => ['courses', username, slug] as const,
  byId: (courseId: string) => ['courses', courseId] as const,
  creator: (username: string) => ['profile', username, 'courses'] as const,
}

export function mineCoursesQueryOptions() {
  return queryOptions({
    queryKey: courseKeys.mine,
    queryFn: () => apiGetRequired<{ courses: CourseSummary[] }>('/api/courses/mine'),
  })
}

export function courseDetailQueryOptions(username: string, slug: string) {
  return queryOptions({
    queryKey: courseKeys.detail(username, slug),
    queryFn: () => apiGetRequired<CourseDetailResponse>(`/api/courses/by-slug/${username}/${slug}`),
  })
}

export function courseByIdQueryOptions(courseId: string) {
  return queryOptions({
    queryKey: courseKeys.byId(courseId),
    queryFn: () => apiGetRequired<CourseDetailResponse>(`/api/courses/${courseId}`),
  })
}

export function creatorCoursesQueryOptions(username: string, enabled: boolean) {
  return queryOptions({
    queryKey: courseKeys.creator(username),
    queryFn: () => apiGetRequired<CreatorCoursesResponse>(`/api/profile/${username}/courses`),
    enabled,
  })
}

export function createCourse(values: { title: string; description?: string }) {
  return apiPostRequired<{ course: CourseSummary }>('/api/courses', values)
}

export function updateCourse(courseId: string, values: Partial<{ title: string; description: string; status: CourseStatus }>) {
  return apiPatchRequired<{ course: CourseSummary }>(`/api/courses/${courseId}`, values)
}

export function publishCourse(courseId: string) {
  return apiPostRequired<{ course: CourseSummary }>(`/api/courses/${courseId}/publish`)
}

export function unpublishCourse(courseId: string) {
  return apiPostRequired<{ course: CourseSummary }>(`/api/courses/${courseId}/unpublish`)
}

export function deleteCourse(courseId: string) {
  return apiDeleteRequired<{ ok: true }>(`/api/courses/${courseId}`)
}

export function createCourseModule(courseId: string, values: { title: string; description?: string }) {
  return apiPostRequired<{ module: CourseModule }>(`/api/courses/${courseId}/modules`, values)
}

export function updateCourseModule(moduleId: string, values: Partial<{ title: string; description: string }>) {
  return apiPatchRequired<{ module: CourseModule }>(`/api/courses/modules/${moduleId}`, values)
}

export function deleteCourseModule(moduleId: string) {
  return apiDeleteRequired<{ ok: true }>(`/api/courses/modules/${moduleId}`)
}

export function reorderCourseModules(courseId: string, itemIds: string[]) {
  return apiPutRequired<{ ok: true }>(`/api/courses/${courseId}/modules/order`, { itemIds })
}

export function createCourseLesson(moduleId: string, values: { title: string; summary?: string; markdown?: string }) {
  return apiPostRequired<{ lesson: CourseLesson }>(`/api/courses/modules/${moduleId}/lessons`, values)
}

export function updateCourseLesson(lessonId: string, values: Partial<{ title: string; summary: string; markdown: string; status: LessonStatus }>) {
  return apiPatchRequired<{ lesson: CourseLesson }>(`/api/courses/lessons/${lessonId}`, values)
}

export function deleteCourseLesson(lessonId: string) {
  return apiDeleteRequired<{ ok: true }>(`/api/courses/lessons/${lessonId}`)
}

export function reorderCourseLessons(moduleId: string, itemIds: string[]) {
  return apiPutRequired<{ ok: true }>(`/api/courses/modules/${moduleId}/lessons/order`, { itemIds })
}

export function deleteCourseAttachment(attachmentId: string) {
  return apiDeleteRequired<{ ok: true }>(`/api/courses/attachments/${attachmentId}`)
}

export function updateLessonProgress(lessonId: string, completed: boolean) {
  return apiPutRequired<{ progress: { completedLessons: number; totalLessons: number } }>(`/api/courses/lessons/${lessonId}/progress`, { completed })
}

export async function uploadCourseAttachment(
  lessonId: string,
  file: File,
  kind: CourseAttachmentKind,
  onProgress?: (progress: number) => void,
) {
  const start = await apiPostRequired<{
    attachmentId: string
    uploadId: string
    key: string
    partSize: number
  }>('/api/courses/uploads/start', {
    lessonId,
    kind,
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
  })

  const parts: Array<{ partNumber: number; etag: string }> = []
  const partCount = Math.ceil(file.size / start.partSize)

  try {
    for (let index = 0; index < partCount; index += 1) {
      const partNumber = index + 1
      const chunk = file.slice(index * start.partSize, Math.min(file.size, (index + 1) * start.partSize))
      const response = await fetch(`/api/courses/uploads/${start.attachmentId}/parts/${partNumber}`, {
        method: 'PUT',
        credentials: 'include',
        body: chunk,
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null
        throw new ApiError(payload?.error?.message ?? 'Attachment upload failed', response.status)
      }
      const uploaded = await response.json() as { partNumber: number; etag: string }
      parts.push({ partNumber: uploaded.partNumber, etag: uploaded.etag })
      onProgress?.(Math.round((parts.length / partCount) * 100))
    }

    const complete = await apiPostRequired<{ attachment: CourseAttachment }>(`/api/courses/uploads/${start.attachmentId}/complete`, { parts })
    return complete.attachment
  } catch (error) {
    await apiDeleteRequired(`/api/courses/attachments/${start.attachmentId}`).catch(() => undefined)
    throw error
  }
}

export function formatCourseFileSize(sizeBytes: number) {
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`
  if (sizeBytes < 1024 * 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
