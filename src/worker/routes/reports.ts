import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { createDb } from '../db/client'
import { contentReports, moderationCases, postReplies, posts, users } from '../db/schema'
import { conflict, notFound, zodHook } from '../lib/http'
import { authMiddleware, type HonoEnv } from '../middleware/auth'

const reportSchema = z.object({
  targetType: z.enum(['post', 'reply', 'user']),
  targetId: z.string().trim().min(1).max(128),
  reason: z.enum(['spam', 'harassment', 'hate', 'sexual', 'violence', 'copyright', 'impersonation', 'other']),
  details: z.string().trim().max(1000).optional(),
})

export const reportRoutes = new Hono<HonoEnv>()

reportRoutes.post('/', authMiddleware, zValidator('json', reportSchema, zodHook), async (c) => {
  const input = c.req.valid('json')
  const db = createDb(c.env.DB)

  const target = input.targetType === 'post'
    ? await db.select({ id: posts.id, ownerId: posts.authorId }).from(posts).where(eq(posts.id, input.targetId)).get()
    : input.targetType === 'reply'
      ? await db.select({ id: postReplies.id, ownerId: postReplies.authorId }).from(postReplies).where(eq(postReplies.id, input.targetId)).get()
      : await db.select({ id: users.id, ownerId: users.id }).from(users).where(eq(users.id, input.targetId)).get()

  if (!target) return notFound(c, 'Report target not found')
  if (target.ownerId === c.var.user.id) return conflict(c, 'You cannot report your own content or profile')

  let moderationCase = await db
    .select({ id: moderationCases.id, status: moderationCases.status })
    .from(moderationCases)
    .where(and(eq(moderationCases.targetType, input.targetType), eq(moderationCases.targetId, input.targetId)))
    .get()

  if (!moderationCase) {
    const caseId = crypto.randomUUID()
    await db.insert(moderationCases).values({
      id: caseId,
      targetType: input.targetType,
      targetId: input.targetId,
    }).onConflictDoNothing().run()
    moderationCase = await db
      .select({ id: moderationCases.id, status: moderationCases.status })
      .from(moderationCases)
      .where(and(eq(moderationCases.targetType, input.targetType), eq(moderationCases.targetId, input.targetId)))
      .get()
  }

  if (!moderationCase) return conflict(c, 'Unable to create moderation case')

  const existing = await db
    .select({ id: contentReports.id })
    .from(contentReports)
    .where(and(eq(contentReports.caseId, moderationCase.id), eq(contentReports.reporterId, c.var.user.id)))
    .get()
  if (existing) return conflict(c, 'You already reported this item')

  const now = new Date()
  await db.batch([
    db.insert(contentReports).values({
      caseId: moderationCase.id,
      reporterId: c.var.user.id,
      reason: input.reason,
      details: input.details || null,
    }),
    db.update(moderationCases).set({
      status: 'open',
      resolutionAction: null,
      resolutionNote: null,
      resolvedBy: null,
      resolvedAt: null,
      updatedAt: now,
    }).where(eq(moderationCases.id, moderationCase.id)),
  ])

  return c.json({ caseId: moderationCase.id, reported: true }, 201)
})
