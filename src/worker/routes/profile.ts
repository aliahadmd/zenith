import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { createDb } from '../db/client'
import { posts, users, subscriptionMemberships } from '../db/schema'
import { authMiddleware, type HonoEnv } from '../middleware/auth'
import { userIdParamSchema, usernameParamSchema } from '../lib/schemas'
import { notFound, zodHook } from '../lib/http'
import { buildPostExtras, hasCreatorAccess, toUnixSeconds } from '../lib/post-data'
import { getCreatorProfileTabs } from '../lib/profile-tabs'
import { listPublishedArticlesForCreator } from './articles'
import { listPublishedAudioForCreator } from './audio'
import { listPublishedPhotographyForCreator } from './photography'
import { listPublishedCoursesForCreator } from './courses'
import { membershipEntitlementCondition } from '../lib/memberships'

export const profileRoutes = new Hono<HonoEnv>()

// ── GET /avatar/:userId ────────────────────────────────────────────────────
// Registered FIRST to prevent /:username from matching "avatar"

profileRoutes.get('/avatar/:userId', zValidator('param', userIdParamSchema, zodHook), async (c) => {
  const { userId } = c.req.valid('param')
  const db = createDb(c.env.DB)

  const user = await db
    .select({ avatarR2Key: users.avatarR2Key })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.accountStatus, 'active')))
    .get()

  if (!user?.avatarR2Key) return notFound(c)

  const object = await c.env.STORAGE.get(user.avatarR2Key)
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
    .where(and(eq(users.username, username), eq(users.accountStatus, 'active')))
    .get()

  if (!user) return notFound(c)

  const categories = user.role === 'creator'
    ? await c.env.DB.prepare(`SELECT c.id, c.slug, c.name FROM creator_categories cc
        JOIN discovery_categories c ON c.id = cc.category_id
        WHERE cc.creator_id = ? AND c.active = 1
        ORDER BY cc.display_order, c.display_order`).bind(user.id)
      .all<{ id: string; slug: string; name: string }>()
    : { results: [] as Array<{ id: string; slug: string; name: string }> }

  return c.json({
    id: user.id,
    displayName: user.displayName,
    username: user.username,
    role: user.role,
    tagline: user.tagline,
    avatarUrl: user.avatarUrl,
    socialLinks: user.socialLinks,
    categories: categories.results,
    profileTabs: user.role === 'creator' ? await getCreatorProfileTabs(db, user.id) : null,
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
      eq(users.accountStatus, 'active'),
      membershipEntitlementCondition(),
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
    .where(and(eq(users.username, username), eq(users.accountStatus, 'active')))
    .get()

  if (!creator || creator.role !== 'creator') return notFound(c, 'Creator not found')

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
      eq(users.accountStatus, 'active'),
      membershipEntitlementCondition(),
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
    .where(and(eq(users.username, username), eq(users.accountStatus, 'active')))
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
      publishedAt: posts.publishedAt,
      authorId: posts.authorId,
      authorDisplayName: users.displayName,
      authorUsername: users.username,
      authorAvatarUrl: users.avatarUrl,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(and(
      eq(posts.authorId, creator.id),
      eq(posts.kind, 'post'),
      isNotNull(posts.publishedAt),
      eq(posts.moderationStatus, 'active'),
      eq(users.accountStatus, 'active'),
    ))
    .orderBy(desc(posts.publishedAt))
    .limit(50)
    .all()

  const extras = await buildPostExtras(db, c.var.user.id, rows.map((row) => row.id))
  const mappedPosts = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    body: row.body,
    createdAt: toUnixSeconds(row.createdAt),
    publishedAt: toUnixSeconds(row.publishedAt),
    author: {
      id: row.authorId,
      displayName: row.authorDisplayName,
      username: row.authorUsername,
      avatarUrl: row.authorAvatarUrl,
    },
    attachments: extras.attachmentsByPostId.get(row.id) ?? [],
    likeCount: extras.postLikeCounts.get(row.id) ?? 0,
    replyCount: extras.postReplyCounts.get(row.id) ?? 0,
    viewerLiked: extras.viewerLikedPostIds.has(row.id),
    viewerSaved: extras.viewerSavedPostIds.has(row.id),
    poll: extras.pollsByPostId.get(row.id) ?? null,
  }))

  return c.json({ posts: mappedPosts, hasAccess: true })
})

// ── GET /:username/articles ───────────────────────────────────────────────

profileRoutes.get('/:username/articles', authMiddleware, zValidator('param', usernameParamSchema, zodHook), async (c) => {
  const { username } = c.req.valid('param')
  const db = createDb(c.env.DB)

  const creator = await db
    .select({
      id: users.id,
      role: users.role,
    })
    .from(users)
    .where(and(eq(users.username, username), eq(users.accountStatus, 'active')))
    .get()

  if (!creator || creator.role !== 'creator') return notFound(c, 'Creator not found')

  const hasAccess = await hasCreatorAccess(db, c.var.user.id, creator.id)
  if (!hasAccess) return c.json({ articles: [], hasAccess: false })

  return c.json({
    articles: await listPublishedArticlesForCreator(db, c.var.user.id, creator.id),
    hasAccess: true,
  })
})

// ── GET /:username/photography ───────────────────────────────────────────

profileRoutes.get('/:username/photography', authMiddleware, zValidator('param', usernameParamSchema, zodHook), async (c) => {
  const { username } = c.req.valid('param')
  const db = createDb(c.env.DB)

  const creator = await db
    .select({
      id: users.id,
      role: users.role,
    })
    .from(users)
    .where(and(eq(users.username, username), eq(users.accountStatus, 'active')))
    .get()

  if (!creator || creator.role !== 'creator') return notFound(c, 'Creator not found')

  const hasAccess = await hasCreatorAccess(db, c.var.user.id, creator.id)
  if (!hasAccess) {
    return c.json({ albums: [], photos: [], hasAccess: false })
  }

  return c.json({
    ...await listPublishedPhotographyForCreator(db, c.var.user.id, creator.id),
    hasAccess: true,
  })
})

// ── GET /:username/audio ─────────────────────────────────────────────────

profileRoutes.get('/:username/audio', authMiddleware, zValidator('param', usernameParamSchema, zodHook), async (c) => {
  const { username } = c.req.valid('param')
  const db = createDb(c.env.DB)

  const creator = await db
    .select({
      id: users.id,
      role: users.role,
    })
    .from(users)
    .where(and(eq(users.username, username), eq(users.accountStatus, 'active')))
    .get()

  if (!creator || creator.role !== 'creator') return notFound(c, 'Creator not found')

  const hasAccess = await hasCreatorAccess(db, c.var.user.id, creator.id)
  if (!hasAccess) {
    return c.json({ items: [], albums: [], episodes: [], podcasts: [], hasAccess: false })
  }

  return c.json({
    ...await listPublishedAudioForCreator(db, c.var.user.id, creator.id),
    hasAccess: true,
  })
})

// ── GET /:username/courses ────────────────────────────────────────────────

profileRoutes.get('/:username/courses', authMiddleware, zValidator('param', usernameParamSchema, zodHook), async (c) => {
  const { username } = c.req.valid('param')
  const db = createDb(c.env.DB)
  const creator = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(eq(users.username, username), eq(users.accountStatus, 'active')))
    .get()

  if (!creator || creator.role !== 'creator') return notFound(c, 'Creator not found')

  const hasAccess = await hasCreatorAccess(db, c.var.user.id, creator.id)
  return c.json({
    courses: await listPublishedCoursesForCreator(db, c.var.user.id, creator.id),
    hasAccess,
  })
})
