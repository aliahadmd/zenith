import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { createDb, type Db } from '../db/client'
import {
  courseAttachments,
  courseLessonProgress,
  courseLessons,
  courseModules,
  courses,
  posts,
  users,
} from '../db/schema'
import { authMiddleware, requireRole, type HonoEnv } from '../middleware/auth'
import {
  badRequest,
  conflict,
  errorResponse,
  forbidden,
  notFound,
  payloadTooLarge,
  unsupportedMediaType,
  zodHook,
} from '../lib/http'
import { buildPostExtras, hasCreatorAccess, toUnixSeconds } from '../lib/post-data'
import { notifySubscribersOfContent } from '../lib/notifications'
import { attachmentIdParamSchema, postSlugParamSchema } from '../lib/schemas'
import { generatePostSlug, serializeReplies } from './posts'

export const coursesRoutes = new Hono<HonoEnv>()

const PART_SIZE = 8 * 1024 * 1024
const MAX_MARKDOWN_LENGTH = 100_000
const MAX_TITLE_LENGTH = 140
const MAX_DESCRIPTION_LENGTH = 2_000
const MAX_SUMMARY_LENGTH = 500
const MAX_UPLOAD_SIZE = {
  video: 2 * 1024 * 1024 * 1024,
  audio: 1 * 1024 * 1024 * 1024,
  file: 250 * 1024 * 1024,
} as const

type CourseStatus = 'draft' | 'published'
type LessonStatus = 'draft' | 'published'
type AttachmentKind = 'video' | 'audio' | 'file'

const coursePayloadSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
  status: z.enum(['draft', 'published']).optional(),
})

const courseUpdateSchema = coursePayloadSchema.partial()
const modulePayloadSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
})
const lessonPayloadSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
  summary: z.string().trim().max(MAX_SUMMARY_LENGTH).optional(),
  markdown: z.string().max(MAX_MARKDOWN_LENGTH).optional(),
  status: z.enum(['draft', 'published']).optional(),
})
const orderSchema = z.object({ itemIds: z.array(z.string().min(1)).min(1) })
const progressSchema = z.object({ completed: z.boolean() })
const uploadStartSchema = z.object({
  lessonId: z.string().min(1),
  kind: z.enum(['video', 'audio', 'file']),
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(160),
  sizeBytes: z.number().int().positive(),
})
const uploadCompleteSchema = z.object({
  parts: z.array(z.object({
    partNumber: z.number().int().min(1).max(10_000),
    etag: z.string().min(1),
  })).min(1),
})
const courseIdParamSchema = z.object({ courseId: z.string().min(1, 'courseId is required') })

type CourseRow = NonNullable<Awaited<ReturnType<typeof getCourseById>>>

function cleanFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 160) || 'attachment'
}

function contentDisposition(kind: AttachmentKind, fileName: string) {
  const disposition = kind === 'file' ? 'attachment' : 'inline'
  return `${disposition}; filename="${encodeURIComponent(fileName)}"`
}

function parseRange(rangeHeader: string | undefined, size: number) {
  if (!rangeHeader) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!match) return { invalid: true as const }

  const [, rawStart, rawEnd] = match
  if (!rawStart && !rawEnd) return { invalid: true as const }

  if (!rawStart) {
    const suffix = Number(rawEnd)
    if (!Number.isFinite(suffix) || suffix <= 0) return { invalid: true as const }
    const start = Math.max(size - suffix, 0)
    return { start, end: size - 1, length: size - start }
  }

  const start = Number(rawStart)
  const end = rawEnd ? Number(rawEnd) : size - 1
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return { invalid: true as const }
  }
  const clampedEnd = Math.min(end, size - 1)
  return { start, end: clampedEnd, length: clampedEnd - start + 1 }
}

async function getCourseById(db: Db, courseId: string) {
  return db
    .select({
      id: courses.id,
      postId: courses.postId,
      creatorId: courses.creatorId,
      slug: courses.slug,
      title: courses.title,
      description: courses.description,
      status: courses.status,
      publishedAt: courses.publishedAt,
      createdAt: courses.createdAt,
      updatedAt: courses.updatedAt,
      authorDisplayName: users.displayName,
      authorUsername: users.username,
      authorAvatarUrl: users.avatarUrl,
      moderationStatus: posts.moderationStatus,
      moderationReason: posts.moderationReason,
      authorAccountStatus: users.accountStatus,
    })
    .from(courses)
    .innerJoin(posts, eq(posts.id, courses.postId))
    .innerJoin(users, eq(users.id, courses.creatorId))
    .where(eq(courses.id, courseId))
    .get()
}

async function getCourseBySlug(db: Db, username: string, slug: string) {
  return db
    .select({
      id: courses.id,
      postId: courses.postId,
      creatorId: courses.creatorId,
      slug: courses.slug,
      title: courses.title,
      description: courses.description,
      status: courses.status,
      publishedAt: courses.publishedAt,
      createdAt: courses.createdAt,
      updatedAt: courses.updatedAt,
      authorDisplayName: users.displayName,
      authorUsername: users.username,
      authorAvatarUrl: users.avatarUrl,
      moderationStatus: posts.moderationStatus,
      moderationReason: posts.moderationReason,
      authorAccountStatus: users.accountStatus,
    })
    .from(courses)
    .innerJoin(posts, eq(posts.id, courses.postId))
    .innerJoin(users, eq(users.id, courses.creatorId))
    .where(and(eq(users.username, username), eq(courses.slug, slug)))
    .get()
}

async function getModuleById(db: Db, moduleId: string) {
  return db
    .select({
      id: courseModules.id,
      courseId: courseModules.courseId,
      title: courseModules.title,
      description: courseModules.description,
      displayOrder: courseModules.displayOrder,
    })
    .from(courseModules)
    .where(eq(courseModules.id, moduleId))
    .get()
}

async function getLessonById(db: Db, lessonId: string) {
  return db
    .select({
      id: courseLessons.id,
      courseId: courseLessons.courseId,
      moduleId: courseLessons.moduleId,
      title: courseLessons.title,
      summary: courseLessons.summary,
      markdown: courseLessons.markdown,
      status: courseLessons.status,
      displayOrder: courseLessons.displayOrder,
      publishedAt: courseLessons.publishedAt,
    })
    .from(courseLessons)
    .where(eq(courseLessons.id, lessonId))
    .get()
}

async function getStructure(db: Db, courseId: string, userId: string, includeDrafts: boolean, includeContent: boolean) {
  const [moduleRows, lessonRows, attachmentRows, progressRows] = await Promise.all([
    db.select().from(courseModules).where(eq(courseModules.courseId, courseId)).orderBy(asc(courseModules.displayOrder)).all(),
    db.select().from(courseLessons).where(eq(courseLessons.courseId, courseId)).orderBy(asc(courseLessons.displayOrder)).all(),
    db.select().from(courseAttachments).where(and(eq(courseAttachments.courseId, courseId), eq(courseAttachments.status, 'ready'))).orderBy(asc(courseAttachments.displayOrder)).all(),
    db.select({ lessonId: courseLessonProgress.lessonId })
      .from(courseLessonProgress)
      .where(and(eq(courseLessonProgress.courseId, courseId), eq(courseLessonProgress.userId, userId)))
      .all(),
  ])

  const completed = new Set(progressRows.map((row) => row.lessonId))
  const attachmentsByLesson = new Map<string, typeof attachmentRows>()
  for (const attachment of attachmentRows) {
    attachmentsByLesson.set(attachment.lessonId, [...(attachmentsByLesson.get(attachment.lessonId) ?? []), attachment])
  }

  return moduleRows
    .map((module) => {
      const lessons = lessonRows
        .filter((lesson) => lesson.moduleId === module.id && (includeDrafts || lesson.status === 'published'))
        .map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          summary: lesson.summary,
          status: lesson.status,
          displayOrder: lesson.displayOrder,
          publishedAt: toUnixSeconds(lesson.publishedAt),
          locked: !includeContent,
          markdown: includeContent ? lesson.markdown : null,
          attachments: includeContent
            ? (attachmentsByLesson.get(lesson.id) ?? []).map((attachment) => ({
                id: attachment.id,
                kind: attachment.kind,
                fileName: attachment.fileName,
                contentType: attachment.contentType,
                sizeBytes: attachment.sizeBytes,
                displayOrder: attachment.displayOrder,
                url: `/api/courses/attachments/${attachment.id}`,
              }))
            : [],
          completed: includeContent && completed.has(lesson.id),
        }))

      return {
        id: module.id,
        title: module.title,
        description: module.description,
        displayOrder: module.displayOrder,
        lessons,
      }
    })
    .filter((module) => includeDrafts || module.lessons.length > 0)
}

async function getCoursePayload(db: Db, viewerId: string, course: CourseRow) {
  const isOwner = viewerId === course.creatorId
  const memberVisible = course.moderationStatus === 'active' && course.authorAccountStatus === 'active'
  if (!memberVisible && !isOwner) return null
  if (!isOwner && course.status !== 'published') return null

  const hasAccess = isOwner || await hasCreatorAccess(db, viewerId, course.creatorId)
  const extras = await buildPostExtras(db, viewerId, [course.postId])
  const modules = await getStructure(db, course.id, viewerId, isOwner, hasAccess)
  const publishedLessons = modules.flatMap((module) => module.lessons).filter((lesson) => lesson.status === 'published')

  return {
    id: course.id,
    postId: course.postId,
    type: 'course' as const,
    slug: course.slug,
    title: course.title,
    description: course.description ?? '',
    status: course.status as CourseStatus,
    createdAt: toUnixSeconds(course.createdAt),
    publishedAt: toUnixSeconds(course.publishedAt),
    updatedAt: toUnixSeconds(course.updatedAt),
    creator: {
      id: course.creatorId,
      displayName: course.authorDisplayName,
      username: course.authorUsername,
      avatarUrl: course.authorAvatarUrl,
    },
    modules,
    hasAccess,
    isOwner,
    moderationStatus: course.moderationStatus,
    moderationReason: isOwner ? course.moderationReason : null,
    progress: hasAccess
      ? {
          completedLessons: publishedLessons.filter((lesson) => lesson.completed).length,
          totalLessons: publishedLessons.length,
        }
      : null,
    likeCount: extras.postLikeCounts.get(course.postId) ?? 0,
    replyCount: extras.postReplyCounts.get(course.postId) ?? 0,
    viewerLiked: extras.viewerLikedPostIds.has(course.postId),
  }
}

async function requireOwnedCourse(db: Db, courseId: string, userId: string) {
  const course = await getCourseById(db, courseId)
  if (!course) return { error: 'not_found' as const }
  if (course.creatorId !== userId) return { error: 'forbidden' as const }
  if (course.moderationStatus !== 'active') return { error: 'moderated' as const }
  return { course }
}

async function deleteAttachmentObjects(c: Context<HonoEnv>, rows: Array<{ r2Key: string; r2UploadId: string | null }>) {
  for (const row of rows) {
    if (row.r2UploadId) {
      try {
        await c.env.STORAGE.resumeMultipartUpload(row.r2Key, row.r2UploadId).abort()
      } catch {
        // The upload may already have expired or been completed.
      }
    }
    await c.env.STORAGE.delete(row.r2Key)
  }
}

async function validatePublishableCourse(db: Db, courseId: string) {
  const lessons = await db
    .select({ id: courseLessons.id, title: courseLessons.title, markdown: courseLessons.markdown })
    .from(courseLessons)
    .where(and(eq(courseLessons.courseId, courseId), eq(courseLessons.status, 'published')))
    .all()
  if (lessons.length === 0) return 'Add and publish at least one lesson before publishing the course.'

  const modules = await db
    .select({ id: courseModules.id })
    .from(courseModules)
    .where(eq(courseModules.courseId, courseId))
    .all()
  if (modules.length === 0) return 'Add at least one module before publishing the course.'
  return null
}

async function validatePublishableLesson(db: Db, lessonId: string) {
  const lesson = await getLessonById(db, lessonId)
  if (!lesson) return 'Lesson not found.'
  if (!lesson.title.trim()) return 'A lesson needs a title before publishing.'
  const attachment = await db
    .select({ id: courseAttachments.id })
    .from(courseAttachments)
    .where(and(eq(courseAttachments.lessonId, lessonId), eq(courseAttachments.status, 'ready')))
    .get()
  if (!lesson.markdown.trim() && !attachment) return 'Add lesson content or an attachment before publishing.'
  return null
}

async function publishCourse(c: Context<HonoEnv>, course: CourseRow) {
  const db = createDb(c.env.DB)
  const validationError = await validatePublishableCourse(db, course.id)
  if (validationError) return errorResponse(c, 422, 'validation_failed', validationError)

  const publishedAt = course.publishedAt ?? new Date()
  await db.update(courses).set({ status: 'published', publishedAt, updatedAt: new Date() }).where(eq(courses.id, course.id)).run()

  const updated = await getCourseById(db, course.id)
  if (updated && course.status !== 'published') {
    await notifySubscribersOfContent(db, c.env, {
      creatorId: updated.creatorId,
      contentType: 'course',
      entityId: updated.id,
      title: updated.title,
      targetUrl: `/u/${updated.authorUsername}/course/${updated.slug}`,
    }, new URL(c.req.url).origin)
  }
  return c.json({ course: updated ? await getCoursePayload(db, c.var.user.id, updated) : null })
}

coursesRoutes.get('/mine', authMiddleware, requireRole('creator'), async (c) => {
  const db = createDb(c.env.DB)
  const rows = await db.select({ id: courses.id }).from(courses).where(eq(courses.creatorId, c.var.user.id)).orderBy(desc(courses.updatedAt)).all()
  const result = []
  for (const row of rows) {
    const course = await getCourseById(db, row.id)
    if (course) result.push(await getCoursePayload(db, c.var.user.id, course))
  }
  return c.json({ courses: result.filter(Boolean) })
})

coursesRoutes.post('/', authMiddleware, requireRole('creator'), zValidator('json', coursePayloadSchema, zodHook), async (c) => {
  const values = c.req.valid('json')
  const db = createDb(c.env.DB)
  const courseId = crypto.randomUUID()
  const postId = crypto.randomUUID()
  const slug = await generatePostSlug(db, c.var.user.id, values.title)

  await db.insert(posts).values({ id: postId, authorId: c.var.user.id, kind: 'course', slug, body: values.description ?? '' }).run()
  await db.insert(courses).values({
    id: courseId,
    postId,
    creatorId: c.var.user.id,
    slug,
    title: values.title,
    description: values.description || null,
    status: 'draft',
  }).run()

  const course = await getCourseById(db, courseId)
  return c.json({ course: course ? await getCoursePayload(db, c.var.user.id, course) : null }, 201)
})

coursesRoutes.get('/by-slug/:username/:slug', authMiddleware, zValidator('param', postSlugParamSchema, zodHook), async (c) => {
  const { username, slug } = c.req.valid('param')
  const db = createDb(c.env.DB)
  const course = await getCourseBySlug(db, username, slug)
  if (!course) return notFound(c, 'Course not found')
  const payload = await getCoursePayload(db, c.var.user.id, course)
  if (!payload) return notFound(c, 'Course not found')
  return c.json({ course: payload, replies: await serializeReplies(db, c.var.user.id, course.postId) })
})

coursesRoutes.get('/:courseId', authMiddleware, zValidator('param', courseIdParamSchema, zodHook), async (c) => {
  const db = createDb(c.env.DB)
  const course = await getCourseById(db, c.req.valid('param').courseId)
  if (!course) return notFound(c, 'Course not found')
  const payload = await getCoursePayload(db, c.var.user.id, course)
  if (!payload) return notFound(c, 'Course not found')
  return c.json({ course: payload, replies: await serializeReplies(db, c.var.user.id, course.postId) })
})

coursesRoutes.patch('/:courseId', authMiddleware, requireRole('creator'), zValidator('param', courseIdParamSchema, zodHook), zValidator('json', courseUpdateSchema, zodHook), async (c) => {
  const courseId = c.req.valid('param').courseId
  const db = createDb(c.env.DB)
  const owned = await requireOwnedCourse(db, courseId, c.var.user.id)
  if ('error' in owned) return owned.error === 'not_found' ? notFound(c, 'Course not found') : forbidden(c, 'You cannot edit this course')
  const values = c.req.valid('json')

  if (values.status === 'published') return publishCourse(c, owned.course)
  await db.update(courses).set({
    ...(values.title === undefined ? {} : { title: values.title }),
    ...(values.description === undefined ? {} : { description: values.description || null }),
    ...(values.status === 'draft' ? { status: 'draft', publishedAt: null } : {}),
    updatedAt: new Date(),
  }).where(eq(courses.id, courseId)).run()
  if (values.description !== undefined) await db.update(posts).set({ body: values.description }).where(eq(posts.id, owned.course.postId)).run()

  const updated = await getCourseById(db, courseId)
  return c.json({ course: updated ? await getCoursePayload(db, c.var.user.id, updated) : null })
})

coursesRoutes.post('/:courseId/publish', authMiddleware, requireRole('creator'), zValidator('param', courseIdParamSchema, zodHook), async (c) => {
  const db = createDb(c.env.DB)
  const owned = await requireOwnedCourse(db, c.req.valid('param').courseId, c.var.user.id)
  if ('error' in owned) return owned.error === 'not_found' ? notFound(c, 'Course not found') : forbidden(c, 'You cannot publish this course')
  return publishCourse(c, owned.course)
})

coursesRoutes.post('/:courseId/unpublish', authMiddleware, requireRole('creator'), zValidator('param', courseIdParamSchema, zodHook), async (c) => {
  const db = createDb(c.env.DB)
  const owned = await requireOwnedCourse(db, c.req.valid('param').courseId, c.var.user.id)
  if ('error' in owned) return owned.error === 'not_found' ? notFound(c, 'Course not found') : forbidden(c, 'You cannot edit this course')
  await db.update(courses).set({ status: 'draft', publishedAt: null, updatedAt: new Date() }).where(eq(courses.id, owned.course.id)).run()
  const updated = await getCourseById(db, owned.course.id)
  return c.json({ course: updated ? await getCoursePayload(db, c.var.user.id, updated) : null })
})

coursesRoutes.delete('/:courseId', authMiddleware, requireRole('creator'), zValidator('param', courseIdParamSchema, zodHook), async (c) => {
  const db = createDb(c.env.DB)
  const owned = await requireOwnedCourse(db, c.req.valid('param').courseId, c.var.user.id)
  if ('error' in owned) return owned.error === 'not_found' ? notFound(c, 'Course not found') : forbidden(c, 'You cannot delete this course')
  const attachments = await db.select({ r2Key: courseAttachments.r2Key, r2UploadId: courseAttachments.r2UploadId }).from(courseAttachments).where(eq(courseAttachments.courseId, owned.course.id)).all()
  await deleteAttachmentObjects(c, attachments)
  await db.delete(courses).where(eq(courses.id, owned.course.id)).run()
  return c.json({ ok: true })
})

coursesRoutes.post('/:courseId/modules', authMiddleware, requireRole('creator'), zValidator('param', courseIdParamSchema, zodHook), zValidator('json', modulePayloadSchema, zodHook), async (c) => {
  const courseId = c.req.valid('param').courseId
  const db = createDb(c.env.DB)
  const owned = await requireOwnedCourse(db, courseId, c.var.user.id)
  if ('error' in owned) return owned.error === 'not_found' ? notFound(c, 'Course not found') : forbidden(c, 'You cannot edit this course')
  const values = c.req.valid('json')
  const current = await db.select({ count: courseModules.id }).from(courseModules).where(eq(courseModules.courseId, courseId)).all()
  const moduleId = crypto.randomUUID()
  await db.insert(courseModules).values({ id: moduleId, courseId, title: values.title, description: values.description || null, displayOrder: current.length }).run()
  return c.json({ module: await getModuleById(db, moduleId) }, 201)
})

coursesRoutes.patch('/modules/:moduleId', authMiddleware, requireRole('creator'), async (c) => {
  const db = createDb(c.env.DB)
  const moduleId = c.req.param('moduleId')
  const module = await getModuleById(db, moduleId)
  if (!module) return notFound(c, 'Module not found')
  const owned = await requireOwnedCourse(db, module.courseId, c.var.user.id)
  if ('error' in owned) return forbidden(c, 'You cannot edit this module')
  const values = modulePayloadSchema.partial().safeParse(await c.req.json().catch(() => null))
  if (!values.success) return errorResponse(c, 422, 'validation_failed', 'Invalid module data', { issues: values.error.issues })
  await db.update(courseModules).set({
    ...(values.data.title === undefined ? {} : { title: values.data.title }),
    ...(values.data.description === undefined ? {} : { description: values.data.description || null }),
    updatedAt: new Date(),
  }).where(eq(courseModules.id, moduleId)).run()
  return c.json({ module: await getModuleById(db, moduleId) })
})

coursesRoutes.put('/:courseId/modules/order', authMiddleware, requireRole('creator'), zValidator('param', courseIdParamSchema, zodHook), zValidator('json', orderSchema, zodHook), async (c) => {
  const courseId = c.req.valid('param').courseId
  const db = createDb(c.env.DB)
  const owned = await requireOwnedCourse(db, courseId, c.var.user.id)
  if ('error' in owned) return owned.error === 'not_found' ? notFound(c, 'Course not found') : forbidden(c, 'You cannot edit this course')
  const existing = await db.select({ id: courseModules.id }).from(courseModules).where(eq(courseModules.courseId, courseId)).all()
  if (existing.length !== c.req.valid('json').itemIds.length || !existing.every((row) => c.req.valid('json').itemIds.includes(row.id))) return badRequest(c, 'Module order does not match this course')
  for (const [index, id] of c.req.valid('json').itemIds.entries()) await db.update(courseModules).set({ displayOrder: index, updatedAt: new Date() }).where(eq(courseModules.id, id)).run()
  return c.json({ ok: true })
})

coursesRoutes.delete('/modules/:moduleId', authMiddleware, requireRole('creator'), async (c) => {
  const db = createDb(c.env.DB)
  const moduleId = c.req.param('moduleId')
  const module = await getModuleById(db, moduleId)
  if (!module) return notFound(c, 'Module not found')
  const owned = await requireOwnedCourse(db, module.courseId, c.var.user.id)
  if ('error' in owned) return forbidden(c, 'You cannot delete this module')
  const lessonIds = await db.select({ id: courseLessons.id }).from(courseLessons).where(eq(courseLessons.moduleId, moduleId)).all()
  const lessonSet = new Set(lessonIds.map((lesson) => lesson.id))
  if (lessonSet.size > 0) {
    const remaining = await db.select({ r2Key: courseAttachments.r2Key, r2UploadId: courseAttachments.r2UploadId }).from(courseAttachments).where(inArray(courseAttachments.lessonId, [...lessonSet])).all()
    await deleteAttachmentObjects(c, remaining)
  }
  await db.delete(courseModules).where(eq(courseModules.id, moduleId)).run()
  return c.json({ ok: true })
})

coursesRoutes.post('/modules/:moduleId/lessons', authMiddleware, requireRole('creator'), async (c) => {
  const db = createDb(c.env.DB)
  const moduleId = c.req.param('moduleId')
  const module = await getModuleById(db, moduleId)
  if (!module) return notFound(c, 'Module not found')
  const owned = await requireOwnedCourse(db, module.courseId, c.var.user.id)
  if ('error' in owned) return forbidden(c, 'You cannot edit this module')
  const parsed = lessonPayloadSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return errorResponse(c, 422, 'validation_failed', 'Invalid lesson data', { issues: parsed.error.issues })
  if (parsed.data.status === 'published') {
    return errorResponse(c, 422, 'validation_failed', 'Save the lesson as a draft before adding content and publishing it.')
  }
  const current = await db.select({ id: courseLessons.id }).from(courseLessons).where(eq(courseLessons.moduleId, moduleId)).all()
  const lessonId = crypto.randomUUID()
  await db.insert(courseLessons).values({
    id: lessonId,
    courseId: module.courseId,
    moduleId,
    title: parsed.data.title,
    summary: parsed.data.summary || null,
    markdown: parsed.data.markdown ?? '',
    displayOrder: current.length,
  }).run()
  return c.json({ lesson: await getLessonById(db, lessonId) }, 201)
})

coursesRoutes.patch('/lessons/:lessonId', authMiddleware, requireRole('creator'), async (c) => {
  const db = createDb(c.env.DB)
  const lessonId = c.req.param('lessonId')
  const lesson = await getLessonById(db, lessonId)
  if (!lesson) return notFound(c, 'Lesson not found')
  const owned = await requireOwnedCourse(db, lesson.courseId, c.var.user.id)
  if ('error' in owned) return forbidden(c, 'You cannot edit this lesson')
  const parsed = lessonPayloadSchema.partial().safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return errorResponse(c, 422, 'validation_failed', 'Invalid lesson data', { issues: parsed.error.issues })
  if (parsed.data.status === 'published') {
    const validationError = await validatePublishableLesson(db, lessonId)
    if (validationError) return errorResponse(c, 422, 'validation_failed', validationError)
  }
  await db.update(courseLessons).set({
    ...(parsed.data.title === undefined ? {} : { title: parsed.data.title }),
    ...(parsed.data.summary === undefined ? {} : { summary: parsed.data.summary || null }),
    ...(parsed.data.markdown === undefined ? {} : { markdown: parsed.data.markdown }),
    ...(parsed.data.status === undefined ? {} : { status: parsed.data.status as LessonStatus, publishedAt: parsed.data.status === 'published' ? (lesson.publishedAt ?? new Date()) : null }),
    updatedAt: new Date(),
  }).where(eq(courseLessons.id, lessonId)).run()
  return c.json({ lesson: await getLessonById(db, lessonId) })
})

coursesRoutes.put('/modules/:moduleId/lessons/order', authMiddleware, requireRole('creator'), async (c) => {
  const db = createDb(c.env.DB)
  const moduleId = c.req.param('moduleId')
  const module = await getModuleById(db, moduleId)
  if (!module) return notFound(c, 'Module not found')
  const owned = await requireOwnedCourse(db, module.courseId, c.var.user.id)
  if ('error' in owned) return forbidden(c, 'You cannot edit this module')
  const parsed = orderSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return errorResponse(c, 422, 'validation_failed', 'Invalid lesson order', { issues: parsed.error.issues })
  const existing = await db.select({ id: courseLessons.id }).from(courseLessons).where(eq(courseLessons.moduleId, moduleId)).all()
  if (existing.length !== parsed.data.itemIds.length || !existing.every((row) => parsed.data.itemIds.includes(row.id))) return badRequest(c, 'Lesson order does not match this module')
  for (const [index, id] of parsed.data.itemIds.entries()) await db.update(courseLessons).set({ displayOrder: index, updatedAt: new Date() }).where(eq(courseLessons.id, id)).run()
  return c.json({ ok: true })
})

coursesRoutes.delete('/lessons/:lessonId', authMiddleware, requireRole('creator'), async (c) => {
  const db = createDb(c.env.DB)
  const lesson = await getLessonById(db, c.req.param('lessonId'))
  if (!lesson) return notFound(c, 'Lesson not found')
  const owned = await requireOwnedCourse(db, lesson.courseId, c.var.user.id)
  if ('error' in owned) return forbidden(c, 'You cannot delete this lesson')
  const attachments = await db.select({ r2Key: courseAttachments.r2Key, r2UploadId: courseAttachments.r2UploadId }).from(courseAttachments).where(eq(courseAttachments.lessonId, lesson.id)).all()
  await deleteAttachmentObjects(c, attachments)
  await db.delete(courseLessons).where(eq(courseLessons.id, lesson.id)).run()
  return c.json({ ok: true })
})

coursesRoutes.post('/uploads/start', authMiddleware, requireRole('creator'), zValidator('json', uploadStartSchema, zodHook), async (c) => {
  const values = c.req.valid('json')
  if (values.sizeBytes > MAX_UPLOAD_SIZE[values.kind]) return payloadTooLarge(c, `This ${values.kind} attachment is too large.`)
  const db = createDb(c.env.DB)
  const lesson = await getLessonById(db, values.lessonId)
  if (!lesson) return notFound(c, 'Lesson not found')
  const owned = await requireOwnedCourse(db, lesson.courseId, c.var.user.id)
  if ('error' in owned) return forbidden(c, 'You cannot upload to this lesson')

  const expectedPrefix = values.kind === 'video' ? 'video/' : values.kind === 'audio' ? 'audio/' : ''
  if (expectedPrefix && !values.contentType.startsWith(expectedPrefix)) return unsupportedMediaType(c, `Use a ${values.kind} file.`)
  const key = `courses/${c.var.user.id}/${lesson.courseId}/${lesson.id}/${crypto.randomUUID()}-${cleanFileName(values.fileName)}`
  const multipart = await c.env.STORAGE.createMultipartUpload(key, {
    httpMetadata: {
      contentType: values.contentType,
      contentDisposition: contentDisposition(values.kind, values.fileName),
    },
  })
  const attachmentId = crypto.randomUUID()
  await db.insert(courseAttachments).values({
    id: attachmentId,
    courseId: lesson.courseId,
    lessonId: lesson.id,
    uploaderId: c.var.user.id,
    kind: values.kind,
    status: 'pending',
    r2Key: key,
    r2UploadId: multipart.uploadId,
    fileName: values.fileName,
    contentType: values.contentType,
    sizeBytes: values.sizeBytes,
  }).run()
  return c.json({ attachmentId, uploadId: multipart.uploadId, key, partSize: PART_SIZE }, 201)
})

coursesRoutes.put('/uploads/:attachmentId/parts/:partNumber', authMiddleware, requireRole('creator'), zValidator('param', attachmentIdParamSchema.extend({ partNumber: z.string().regex(/^\d+$/) }), zodHook), async (c) => {
  const { attachmentId, partNumber: rawPartNumber } = c.req.valid('param')
  const partNumber = Number(rawPartNumber)
  if (partNumber < 1 || partNumber > 10_000) return badRequest(c, 'Invalid multipart part number')
  const db = createDb(c.env.DB)
  const attachment = await db.select().from(courseAttachments).where(eq(courseAttachments.id, attachmentId)).get()
  if (!attachment) return notFound(c, 'Attachment upload not found')
  if (attachment.uploaderId !== c.var.user.id) return forbidden(c, 'You cannot upload this attachment')
  if (attachment.status !== 'pending' || !attachment.r2UploadId) return conflict(c, 'Attachment upload is no longer active')
  if (!c.req.raw.body) return badRequest(c, 'Missing upload part body')
  const upload = c.env.STORAGE.resumeMultipartUpload(attachment.r2Key, attachment.r2UploadId)
  try {
    const uploadedPart = await upload.uploadPart(partNumber, c.req.raw.body)
    return c.json(uploadedPart)
  } catch (error) {
    return errorResponse(c, 400, 'upload_failed', error instanceof Error ? error.message : 'Upload part failed')
  }
})

coursesRoutes.post('/uploads/:attachmentId/complete', authMiddleware, requireRole('creator'), zValidator('param', attachmentIdParamSchema, zodHook), zValidator('json', uploadCompleteSchema, zodHook), async (c) => {
  const attachmentId = c.req.valid('param').attachmentId
  const db = createDb(c.env.DB)
  const attachment = await db.select().from(courseAttachments).where(eq(courseAttachments.id, attachmentId)).get()
  if (!attachment) return notFound(c, 'Attachment upload not found')
  if (attachment.uploaderId !== c.var.user.id) return forbidden(c, 'You cannot complete this attachment')
  if (attachment.status !== 'pending' || !attachment.r2UploadId) return conflict(c, 'Attachment upload is no longer active')
  try {
    const upload = c.env.STORAGE.resumeMultipartUpload(attachment.r2Key, attachment.r2UploadId)
    const object = await upload.complete(c.req.valid('json').parts)
    if (object.size !== attachment.sizeBytes) {
      await c.env.STORAGE.delete(attachment.r2Key)
      await db.delete(courseAttachments).where(eq(courseAttachments.id, attachmentId)).run()
      return errorResponse(c, 422, 'validation_failed', 'Uploaded file size did not match the declared size.')
    }
    await db.update(courseAttachments).set({ status: 'ready', r2UploadId: null, updatedAt: new Date() }).where(eq(courseAttachments.id, attachmentId)).run()
    const ready = await db.select().from(courseAttachments).where(eq(courseAttachments.id, attachmentId)).get()
    return c.json({ attachment: ready ? serializeAttachment(ready) : null })
  } catch (error) {
    return errorResponse(c, 400, 'upload_failed', error instanceof Error ? error.message : 'Could not complete upload')
  }
})

coursesRoutes.delete('/attachments/:attachmentId', authMiddleware, requireRole('creator'), zValidator('param', attachmentIdParamSchema, zodHook), async (c) => {
  const db = createDb(c.env.DB)
  const attachment = await db.select().from(courseAttachments).where(eq(courseAttachments.id, c.req.valid('param').attachmentId)).get()
  if (!attachment) return notFound(c, 'Attachment not found')
  if (attachment.uploaderId !== c.var.user.id) return forbidden(c, 'You cannot delete this attachment')
  await deleteAttachmentObjects(c, [attachment])
  await db.delete(courseAttachments).where(eq(courseAttachments.id, attachment.id)).run()
  return c.json({ ok: true })
})

coursesRoutes.get('/attachments/:attachmentId', authMiddleware, zValidator('param', attachmentIdParamSchema, zodHook), async (c) => {
  const db = createDb(c.env.DB)
  const attachment = await db.select().from(courseAttachments).where(eq(courseAttachments.id, c.req.valid('param').attachmentId)).get()
  if (!attachment || attachment.status !== 'ready') return notFound(c, 'Attachment not found')
  const course = await getCourseById(db, attachment.courseId)
  const lesson = await getLessonById(db, attachment.lessonId)
  if (!course || !lesson) return notFound(c, 'Attachment not found')
  if (course.moderationStatus !== 'active' || course.authorAccountStatus !== 'active') return notFound(c, 'Attachment not found')
  const isOwner = c.var.user.id === course.creatorId
  if (!isOwner && (course.status !== 'published' || lesson.status !== 'published' || !await hasCreatorAccess(db, c.var.user.id, course.creatorId))) {
    return forbidden(c, 'You do not have access to this attachment')
  }

  const range = parseRange(c.req.header('range'), attachment.sizeBytes)
  if (range && 'invalid' in range) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${attachment.sizeBytes}` } })
  const object = range
    ? await c.env.STORAGE.get(attachment.r2Key, { range: { offset: range.start, length: range.length } })
    : await c.env.STORAGE.get(attachment.r2Key)
  if (!object?.body) return notFound(c, 'Attachment not found')

  const headers = new Headers()
  headers.set('content-type', attachment.contentType)
  headers.set('content-disposition', contentDisposition(attachment.kind, attachment.fileName))
  headers.set('cache-control', 'private, max-age=300')
  headers.set('x-content-type-options', 'nosniff')
  headers.set('etag', object.httpEtag)
  if (attachment.kind !== 'file') headers.set('accept-ranges', 'bytes')
  if (range) {
    headers.set('content-range', `bytes ${range.start}-${range.end}/${attachment.sizeBytes}`)
    headers.set('content-length', String(range.length))
    return new Response(object.body, { status: 206, headers })
  }
  headers.set('content-length', String(attachment.sizeBytes))
  return new Response(object.body, { headers })
})

coursesRoutes.put('/lessons/:lessonId/progress', authMiddleware, zValidator('param', z.object({ lessonId: z.string().min(1) }), zodHook), zValidator('json', progressSchema, zodHook), async (c) => {
  const db = createDb(c.env.DB)
  const lesson = await getLessonById(db, c.req.valid('param').lessonId)
  if (!lesson || lesson.status !== 'published') return notFound(c, 'Lesson not found')
  const course = await getCourseById(db, lesson.courseId)
  if (!course || course.status !== 'published') return notFound(c, 'Course not found')
  if (course.moderationStatus !== 'active' || course.authorAccountStatus !== 'active') return notFound(c, 'Course not found')
  if (!await hasCreatorAccess(db, c.var.user.id, course.creatorId)) return forbidden(c, 'Subscribe to this creator to track course progress')

  if (c.req.valid('json').completed) {
    await db.insert(courseLessonProgress).values({ courseId: course.id, lessonId: lesson.id, userId: c.var.user.id }).onConflictDoUpdate({
      target: [courseLessonProgress.lessonId, courseLessonProgress.userId],
      set: { completedAt: new Date(), courseId: course.id },
    }).run()
  } else {
    await db.delete(courseLessonProgress).where(and(eq(courseLessonProgress.lessonId, lesson.id), eq(courseLessonProgress.userId, c.var.user.id))).run()
  }
  const progressRows = await db.select({ lessonId: courseLessonProgress.lessonId }).from(courseLessonProgress).where(and(eq(courseLessonProgress.courseId, course.id), eq(courseLessonProgress.userId, c.var.user.id))).all()
  const lessonRows = await db.select({ id: courseLessons.id }).from(courseLessons).where(and(eq(courseLessons.courseId, course.id), eq(courseLessons.status, 'published'))).all()
  return c.json({ progress: { completedLessons: progressRows.length, totalLessons: lessonRows.length } })
})

export async function listPublishedCoursesForCreator(db: Db, viewerId: string, creatorId: string) {
  const rows = await db.select({ id: courses.id }).from(courses).where(and(eq(courses.creatorId, creatorId), eq(courses.status, 'published'))).orderBy(desc(courses.publishedAt)).limit(100).all()
  const result = []
  for (const row of rows) {
    const course = await getCourseById(db, row.id)
    if (course) {
      const payload = await getCoursePayload(db, viewerId, course)
      if (payload) result.push(payload)
    }
  }
  return result
}

export function serializeAttachment(attachment: typeof courseAttachments.$inferSelect) {
  return {
    id: attachment.id,
    kind: attachment.kind,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    sizeBytes: attachment.sizeBytes,
    displayOrder: attachment.displayOrder,
    url: `/api/courses/attachments/${attachment.id}`,
  }
}
