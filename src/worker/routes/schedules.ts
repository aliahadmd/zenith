import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { createDb, type Db } from '../db/client'
import {
  articles,
  audioItems,
  contentSchedules,
  courses,
  photographyAlbums,
  posts,
} from '../db/schema'
import { authMiddleware, requireRole, type HonoEnv } from '../middleware/auth'
import { conflict, errorResponse, forbidden, notFound, zodHook } from '../lib/http'
import {
  getPublicationRecord,
  isRecordPublished,
  PublicationError,
  publishContent,
  validatePublishableContent,
} from '../lib/publication'
import { toUnixSeconds } from '../lib/post-data'

export const schedulesRoutes = new Hono<HonoEnv>()

const postIdSchema = z.object({ postId: z.string().min(1).max(128) })
const scheduleInputSchema = z.object({ scheduledFor: z.string().datetime({ offset: true }) })
const scheduleListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['upcoming', 'failed', 'history']).default('upcoming'),
  type: z.enum(['all', 'post', 'article', 'audio', 'photography', 'course']).default('all'),
})

schedulesRoutes.use('*', authMiddleware, requireRole('creator'))

function scheduleSelect() {
  return {
    postId: contentSchedules.postId,
    creatorId: contentSchedules.creatorId,
    status: contentSchedules.status,
    scheduledFor: contentSchedules.scheduledFor,
    nextAttemptAt: contentSchedules.nextAttemptAt,
    attemptCount: contentSchedules.attemptCount,
    revision: contentSchedules.revision,
    processingStartedAt: contentSchedules.processingStartedAt,
    lastErrorCode: contentSchedules.lastErrorCode,
    lastErrorMessage: contentSchedules.lastErrorMessage,
    publishedAt: contentSchedules.publishedAt,
    createdAt: contentSchedules.createdAt,
    updatedAt: contentSchedules.updatedAt,
    contentType: posts.kind,
    postSlug: posts.slug,
    body: posts.body,
    articleTitle: articles.title,
    audioId: audioItems.id,
    audioTitle: audioItems.title,
    photographyId: photographyAlbums.id,
    photographyTitle: photographyAlbums.title,
    courseId: courses.id,
    courseTitle: courses.title,
  }
}

type ScheduleRow = Awaited<ReturnType<typeof getScheduleRow>>

function serializeSchedule(row: NonNullable<ScheduleRow>) {
  const title = row.contentType === 'article'
    ? row.articleTitle
    : row.contentType === 'audio'
      ? row.audioTitle
      : row.contentType === 'photography'
        ? row.photographyTitle
        : row.contentType === 'course'
          ? row.courseTitle
          : row.body

  return {
    postId: row.postId,
    contentId: row.contentType === 'audio'
      ? row.audioId
      : row.contentType === 'photography'
        ? row.photographyId
        : row.contentType === 'course'
          ? row.courseId
          : row.postId,
    contentType: row.contentType,
    slug: row.postSlug,
    title: title?.trim() || 'Untitled content',
    status: row.status,
    scheduledFor: toUnixSeconds(row.scheduledFor),
    nextAttemptAt: toUnixSeconds(row.nextAttemptAt),
    attemptCount: row.attemptCount,
    revision: row.revision,
    processingStartedAt: toUnixSeconds(row.processingStartedAt),
    publishedAt: toUnixSeconds(row.publishedAt),
    failure: row.lastErrorCode ? { code: row.lastErrorCode, message: row.lastErrorMessage || 'Publication failed.' } : null,
    createdAt: toUnixSeconds(row.createdAt),
    updatedAt: toUnixSeconds(row.updatedAt),
  }
}

function scheduleQuery(db: Db) {
  return db
    .select(scheduleSelect())
    .from(contentSchedules)
    .innerJoin(posts, eq(posts.id, contentSchedules.postId))
    .leftJoin(articles, eq(articles.postId, posts.id))
    .leftJoin(audioItems, eq(audioItems.postId, posts.id))
    .leftJoin(photographyAlbums, eq(photographyAlbums.postId, posts.id))
    .leftJoin(courses, eq(courses.postId, posts.id))
}

async function getScheduleRow(db: Db, creatorId: string, postId: string) {
  return scheduleQuery(db).where(and(
    eq(contentSchedules.postId, postId),
    eq(contentSchedules.creatorId, creatorId),
  )).get()
}

function publicationErrorResponse(c: Parameters<typeof errorResponse>[0], error: PublicationError) {
  if (error.code === 'not_found') return notFound(c, error.message)
  if (error.code === 'account_suspended' || error.code === 'content_moderated') return forbidden(c, error.message)
  return errorResponse(c, 422, error.code, error.message)
}

schedulesRoutes.get('/', zValidator('query', scheduleListSchema, zodHook), async (c) => {
  const input = c.req.valid('query')
  const db = createDb(c.env.DB)
  const statusCondition = input.status === 'upcoming'
    ? inArray(contentSchedules.status, ['pending', 'processing'])
    : input.status === 'failed'
      ? eq(contentSchedules.status, 'failed')
      : inArray(contentSchedules.status, ['published', 'canceled'])
  const conditions: SQL[] = [eq(contentSchedules.creatorId, c.var.user.id), statusCondition]
  if (input.type !== 'all') conditions.push(eq(posts.kind, input.type))
  const where = and(...conditions)
  const offset = (input.page - 1) * input.pageSize

  const [rows, count] = await Promise.all([
    scheduleQuery(db)
      .where(where)
      .orderBy(desc(input.status === 'history' ? contentSchedules.updatedAt : contentSchedules.scheduledFor))
      .limit(input.pageSize)
      .offset(offset)
      .all(),
    db
      .select({ count: sql<number>`count(*)` })
      .from(contentSchedules)
      .innerJoin(posts, eq(posts.id, contentSchedules.postId))
      .where(where)
      .get(),
  ])

  return c.json({
    items: rows.map(serializeSchedule),
    page: input.page,
    pageSize: input.pageSize,
    total: Number(count?.count ?? 0),
  })
})

schedulesRoutes.get('/:postId', zValidator('param', postIdSchema, zodHook), async (c) => {
  const row = await getScheduleRow(createDb(c.env.DB), c.var.user.id, c.req.valid('param').postId)
  if (!row) return notFound(c, 'Schedule not found')
  return c.json({ schedule: serializeSchedule(row) })
})

schedulesRoutes.put(
  '/:postId',
  zValidator('param', postIdSchema, zodHook),
  zValidator('json', scheduleInputSchema, zodHook),
  async (c) => {
    const { postId } = c.req.valid('param')
    const scheduledFor = new Date(c.req.valid('json').scheduledFor)
    if (scheduledFor.getTime() < Date.now() + 60_000) {
      return errorResponse(c, 422, 'schedule_too_soon', 'Choose a publication time at least one minute in the future.')
    }

    const db = createDb(c.env.DB)
    const record = await getPublicationRecord(db, postId)
    if (!record) return notFound(c, 'Content not found')
    if (record.creatorId !== c.var.user.id) return forbidden(c, 'You cannot schedule this content')
    if (isRecordPublished(record)) return conflict(c, 'Only draft content can be scheduled')

    const existing = await db.select().from(contentSchedules).where(eq(contentSchedules.postId, postId)).get()
    if (existing?.status === 'processing') return errorResponse(c, 409, 'schedule_processing', 'This content is being published now.')

    try {
      await validatePublishableContent(db, record)
    } catch (error) {
      if (error instanceof PublicationError) return publicationErrorResponse(c, error)
      throw error
    }

    const now = new Date()
    await db.insert(contentSchedules).values({
      postId,
      creatorId: c.var.user.id,
      scheduledFor,
      nextAttemptAt: scheduledFor,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: contentSchedules.postId,
      set: {
        status: 'pending',
        scheduledFor,
        nextAttemptAt: scheduledFor,
        attemptCount: 0,
        revision: sql`${contentSchedules.revision} + 1`,
        processingStartedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        publishedAt: null,
        updatedAt: now,
      },
    }).run()

    const row = await getScheduleRow(db, c.var.user.id, postId)
    console.log(JSON.stringify({ event: 'content_scheduled', postId, kind: record.kind, scheduledFor: scheduledFor.toISOString() }))
    return c.json({ schedule: row ? serializeSchedule(row) : null })
  },
)

schedulesRoutes.delete('/:postId', zValidator('param', postIdSchema, zodHook), async (c) => {
  const { postId } = c.req.valid('param')
  const db = createDb(c.env.DB)
  const row = await getScheduleRow(db, c.var.user.id, postId)
  if (!row) return c.json({ canceled: true, schedule: null })
  if (row.status === 'processing') return errorResponse(c, 409, 'schedule_processing', 'This content is being published now.')
  if (row.status === 'published') return conflict(c, 'Published schedules cannot be canceled')

  await db.update(contentSchedules).set({
    status: 'canceled',
    processingStartedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    updatedAt: new Date(),
  }).where(eq(contentSchedules.postId, postId)).run()
  const updated = await getScheduleRow(db, c.var.user.id, postId)
  return c.json({ canceled: true, schedule: updated ? serializeSchedule(updated) : null })
})

schedulesRoutes.post('/:postId/retry', zValidator('param', postIdSchema, zodHook), async (c) => {
  const { postId } = c.req.valid('param')
  const db = createDb(c.env.DB)
  const row = await getScheduleRow(db, c.var.user.id, postId)
  if (!row) return notFound(c, 'Schedule not found')
  if (row.status !== 'failed') return conflict(c, 'Only failed schedules can be retried')
  const record = await getPublicationRecord(db, postId)
  if (!record) return notFound(c, 'Content not found')

  try {
    await validatePublishableContent(db, record)
  } catch (error) {
    if (error instanceof PublicationError) return publicationErrorResponse(c, error)
    throw error
  }

  const now = new Date()
  await db.update(contentSchedules).set({
    status: 'pending',
    nextAttemptAt: now,
    attemptCount: 0,
    revision: sql`${contentSchedules.revision} + 1`,
    processingStartedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    updatedAt: now,
  }).where(eq(contentSchedules.postId, postId)).run()
  const updated = await getScheduleRow(db, c.var.user.id, postId)
  return c.json({ schedule: updated ? serializeSchedule(updated) : null })
})

schedulesRoutes.post('/:postId/publish', zValidator('param', postIdSchema, zodHook), async (c) => {
  const { postId } = c.req.valid('param')
  const db = createDb(c.env.DB)
  const record = await getPublicationRecord(db, postId)
  if (!record) return notFound(c, 'Content not found')
  if (record.creatorId !== c.var.user.id) return forbidden(c, 'You cannot publish this content')
  const schedule = await db.select().from(contentSchedules).where(eq(contentSchedules.postId, postId)).get()
  if (schedule?.status === 'processing') return errorResponse(c, 409, 'schedule_processing', 'This content is being published now.')

  try {
    await publishContent(db, c.env, postId, { origin: new URL(c.req.url).origin })
  } catch (error) {
    if (error instanceof PublicationError) return publicationErrorResponse(c, error)
    throw error
  }

  const updated = await getScheduleRow(db, c.var.user.id, postId)
  return c.json({ published: true, schedule: updated ? serializeSchedule(updated) : null })
})
