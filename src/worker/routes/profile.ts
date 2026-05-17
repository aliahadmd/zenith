import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, gt, or } from 'drizzle-orm'
import { createDb } from '../db/client'
import { posts, users, subscriptionMemberships } from '../db/schema'
import { authMiddleware, type HonoEnv } from '../middleware/auth'
import { userIdParamSchema, usernameParamSchema } from '../lib/schemas'
import { notFound, zodHook } from '../lib/http'
import { buildPostExtras, hasCreatorAccess, toUnixSeconds } from '../lib/post-data'

export const profileRoutes = new Hono<HonoEnv>()

// ── GET /avatar/:userId ────────────────────────────────────────────────────
// Registered FIRST to prevent /:username from matching "avatar"

profileRoutes.get('/avatar/:userId', zValidator('param', userIdParamSchema, zodHook), async (c) => {
  const { userId } = c.req.valid('param')
  const db = createDb(c.env.DB)

  const user = await db
    .select({ avatarR2Key: users.avatarR2Key })
    .from(users)
    .where(eq(users.id, userId))
    .get()

  if (!user?.avatarR2Key) return notFound(c)

  const object = await c.env.AVATARS.get(user.avatarR2Key)
  if (!object) return notFound(c)

  const contentType = object.httpMetadata?.contentType ?? 'application/octet-stream'
  return new Response(object.body, { headers: { 'Content-Type': contentType } })
})

// ── GET /:username ─────────────────────────────────────────────────────────

profileRoutes.get('/:username', zValidator('param', usernameParamSchema, zodHook), async (c) => {
  const { username } = c.req.valid('param')
  const db = createDb(c.env.DB)

  const user = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      username: users.username,
      role: users.role,
      tagline: users.tagline,
      avatarUrl: users.avatarUrl,
      socialLinks: users.socialLinks,
    })
    .from(users)
    .where(eq(users.username, username))
    .get()

  if (!user) return notFound(c)

  return c.json({
    id: user.id,
    displayName: user.displayName,
    username: user.username,
    role: user.role,
    tagline: user.tagline,
    avatarUrl: user.avatarUrl,
    socialLinks: user.socialLinks,
  })
})

// ── GET /:username/subscriptions ───────────────────────────────────────────

profileRoutes.get('/:username/subscriptions', zValidator('param', usernameParamSchema, zodHook), async (c) => {
  const { username } = c.req.valid('param')
  const db = createDb(c.env.DB)

  const user = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .get()

  if (!user) return notFound(c)

  const now = Math.floor(Date.now() / 1000)
  const subscriptions = await db
    .select({
      displayName: users.displayName,
      username: users.username,
      avatarUrl: users.avatarUrl,
      status: subscriptionMemberships.status,
      accessType: subscriptionMemberships.accessType,
    })
    .from(subscriptionMemberships)
    .innerJoin(users, eq(users.id, subscriptionMemberships.creatorId))
    .where(and(
      eq(subscriptionMemberships.subscriberId, user.id),
      eq(users.role, 'creator'),
      or(
        eq(subscriptionMemberships.status, 'active'),
        and(eq(subscriptionMemberships.status, 'trialing'), gt(subscriptionMemberships.trialEndsAt, now)),
      ),
    ))
    .all()

  return c.json({ subscriptions })
})

// ── GET /:username/subscribers ────────────────────────────────────────────

profileRoutes.get('/:username/subscribers', authMiddleware, zValidator('param', usernameParamSchema, zodHook), async (c) => {
  const { username } = c.req.valid('param')
  const db = createDb(c.env.DB)

  const creator = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.username, username))
    .get()

  if (!creator || creator.role !== 'creator') return notFound(c, 'Creator not found')

  const now = Math.floor(Date.now() / 1000)
  const subscribers = await db
    .select({
      displayName: users.displayName,
      username: users.username,
      avatarUrl: users.avatarUrl,
      status: subscriptionMemberships.status,
      accessType: subscriptionMemberships.accessType,
      trialEndsAt: subscriptionMemberships.trialEndsAt,
      createdAt: subscriptionMemberships.createdAt,
    })
    .from(subscriptionMemberships)
    .innerJoin(users, eq(users.id, subscriptionMemberships.subscriberId))
    .where(and(
      eq(subscriptionMemberships.creatorId, creator.id),
      or(
        eq(subscriptionMemberships.status, 'active'),
        and(eq(subscriptionMemberships.status, 'trialing'), gt(subscriptionMemberships.trialEndsAt, now)),
      ),
    ))
    .orderBy(desc(subscriptionMemberships.createdAt))
    .limit(100)
    .all()

  return c.json({ subscribers })
})

// ── GET /:username/posts ──────────────────────────────────────────────────

profileRoutes.get('/:username/posts', authMiddleware, zValidator('param', usernameParamSchema, zodHook), async (c) => {
  const { username } = c.req.valid('param')
  const db = createDb(c.env.DB)

  const creator = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      username: users.username,
      role: users.role,
    })
    .from(users)
    .where(eq(users.username, username))
    .get()

  if (!creator || creator.role !== 'creator') return notFound(c, 'Creator not found')

  const hasAccess = await hasCreatorAccess(db, c.var.user.id, creator.id)
  if (!hasAccess) return c.json({ posts: [], hasAccess: false })

  const rows = await db
    .select({
      id: posts.id,
      slug: posts.slug,
      body: posts.body,
      createdAt: posts.createdAt,
      authorId: posts.authorId,
      authorDisplayName: users.displayName,
      authorUsername: users.username,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(eq(posts.authorId, creator.id))
    .orderBy(desc(posts.createdAt))
    .limit(50)
    .all()

  const extras = await buildPostExtras(db, c.var.user.id, rows.map((row) => row.id))
  const mappedPosts = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    body: row.body,
    createdAt: toUnixSeconds(row.createdAt),
    author: {
      id: row.authorId,
      displayName: row.authorDisplayName,
      username: row.authorUsername,
    },
    attachments: extras.attachmentsByPostId.get(row.id) ?? [],
    likeCount: extras.postLikeCounts.get(row.id) ?? 0,
    replyCount: extras.postReplyCounts.get(row.id) ?? 0,
    viewerLiked: extras.viewerLikedPostIds.has(row.id),
    poll: extras.pollsByPostId.get(row.id) ?? null,
  }))

  return c.json({ posts: mappedPosts, hasAccess: true })
})
