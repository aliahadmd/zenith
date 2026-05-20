import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { createDb } from '../db/client'
import { notifications, users } from '../db/schema'
import { authMiddleware, type HonoEnv } from '../middleware/auth'
import { notificationIdParamSchema, notificationPreferencesSchema } from '../lib/schemas'
import { getNotificationPreferences, updateNotificationPreferences } from '../lib/notifications'
import { notFound, zodHook } from '../lib/http'

export const notificationsRoutes = new Hono<HonoEnv>()

function toUnixSeconds(value: Date | number | null) {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000)
  return value
}

function parseMetadata(raw: string | null) {
  if (!raw) return null
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

function serializeNotification(row: {
  id: string
  type: string
  category: string
  title: string
  body: string
  targetUrl: string | null
  entityType: string | null
  entityId: string | null
  metadata: string | null
  readAt: number | null
  emailStatus: string
  emailError: string | null
  emailSentAt: number | null
  createdAt: number
  actorId: string | null
  actorDisplayName: string | null
  actorUsername: string | null
  actorAvatarUrl: string | null
}) {
  return {
    id: row.id,
    type: row.type,
    category: row.category,
    title: row.title,
    body: row.body,
    targetUrl: row.targetUrl,
    entityType: row.entityType,
    entityId: row.entityId,
    metadata: parseMetadata(row.metadata),
    readAt: row.readAt,
    unread: row.readAt === null,
    emailStatus: row.emailStatus,
    emailError: row.emailError,
    emailSentAt: row.emailSentAt,
    createdAt: toUnixSeconds(row.createdAt),
    actor: row.actorId
      ? {
          id: row.actorId,
          displayName: row.actorDisplayName,
          username: row.actorUsername,
          avatarUrl: row.actorAvatarUrl,
        }
      : null,
  }
}

notificationsRoutes.get('/', authMiddleware, async (c) => {
  const filter = c.req.query('filter') === 'unread' ? 'unread' : 'all'
  const rawLimit = Number(c.req.query('limit') ?? 30)
  const rawOffset = Number(c.req.query('offset') ?? 0)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50) : 30
  const offset = Number.isFinite(rawOffset) ? Math.max(Math.trunc(rawOffset), 0) : 0
  const db = createDb(c.env.DB)
  const where = filter === 'unread'
    ? and(eq(notifications.recipientId, c.var.user.id), isNull(notifications.readAt))
    : eq(notifications.recipientId, c.var.user.id)

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      category: notifications.category,
      title: notifications.title,
      body: notifications.body,
      targetUrl: notifications.targetUrl,
      entityType: notifications.entityType,
      entityId: notifications.entityId,
      metadata: notifications.metadata,
      readAt: notifications.readAt,
      emailStatus: notifications.emailStatus,
      emailError: notifications.emailError,
      emailSentAt: notifications.emailSentAt,
      createdAt: notifications.createdAt,
      actorId: notifications.actorId,
      actorDisplayName: users.displayName,
      actorUsername: users.username,
      actorAvatarUrl: users.avatarUrl,
    })
    .from(notifications)
    .leftJoin(users, eq(users.id, notifications.actorId))
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(limit + 1)
    .offset(offset)
    .all()

  const hasMore = rows.length > limit
  return c.json({
    notifications: rows.slice(0, limit).map(serializeNotification),
    nextOffset: hasMore ? offset + limit : null,
  })
})

notificationsRoutes.get('/unread-count', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const row = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.recipientId, c.var.user.id), isNull(notifications.readAt)))
    .get()

  return c.json({ count: Number(row?.count ?? 0) })
})

notificationsRoutes.get('/preferences', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  return c.json({ preferences: await getNotificationPreferences(db, c.var.user.id) })
})

notificationsRoutes.put(
  '/preferences',
  authMiddleware,
  zValidator('json', notificationPreferencesSchema, zodHook),
  async (c) => {
    const db = createDb(c.env.DB)
    return c.json({
      preferences: await updateNotificationPreferences(db, c.var.user.id, c.req.valid('json')),
    })
  },
)

notificationsRoutes.patch(
  '/:notificationId/read',
  authMiddleware,
  zValidator('param', notificationIdParamSchema, zodHook),
  async (c) => {
    const { notificationId } = c.req.valid('param')
    const db = createDb(c.env.DB)
    const existing = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.id, notificationId), eq(notifications.recipientId, c.var.user.id)))
      .get()

    if (!existing) return notFound(c, 'Notification not found')

    await db
      .update(notifications)
      .set({ readAt: nowSeconds() })
      .where(eq(notifications.id, notificationId))
      .run()

    return c.json({ ok: true })
  },
)

notificationsRoutes.post('/read-all', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  await db
    .update(notifications)
    .set({ readAt: nowSeconds() })
    .where(and(eq(notifications.recipientId, c.var.user.id), isNull(notifications.readAt)))
    .run()

  return c.json({ ok: true })
})

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}
