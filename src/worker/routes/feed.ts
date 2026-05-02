import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, gt, or } from 'drizzle-orm'
import { createDb } from '../db/client'
import { posts, follows, users, subscriptionMemberships, membershipPlans } from '../db/schema'
import { authMiddleware, type HonoEnv } from '../middleware/auth'
import { subscribeSchema } from '../lib/schemas'
import { conflict, notFound, zodHook } from '../lib/http'

export const feedRoutes = new Hono<HonoEnv>()

// ── GET / ──────────────────────────────────────────────────────────────────

feedRoutes.get('/', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const now = Math.floor(Date.now() / 1000)

  const rows = await db
    .select({
      id: posts.id,
      body: posts.body,
      createdAt: posts.createdAt,
      authorDisplayName: users.displayName,
      authorUsername: users.username,
    })
    .from(posts)
    .innerJoin(subscriptionMemberships, eq(subscriptionMemberships.creatorId, posts.authorId))
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(and(
      eq(subscriptionMemberships.subscriberId, c.var.user.id),
      or(
        eq(subscriptionMemberships.status, 'active'),
        and(eq(subscriptionMemberships.status, 'trialing'), gt(subscriptionMemberships.trialEndsAt, now)),
      ),
    ))
    .orderBy(desc(posts.createdAt))
    .all()

  if (rows.length === 0) {
    return c.json({ posts: [], message: "You haven't subscribed to any creators yet" })
  }

  const mappedPosts = rows.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.createdAt,
    author: {
      displayName: row.authorDisplayName,
      username: row.authorUsername,
    },
  }))

  return c.json({ posts: mappedPosts })
})

// ── POST /subscribe ────────────────────────────────────────────────────────

feedRoutes.post('/subscribe', authMiddleware, zValidator('json', subscribeSchema, zodHook), async (c) => {
  const { creatorId } = c.req.valid('json')
  const db = createDb(c.env.DB)

  // Verify the target user exists and is a creator
  const creator = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, creatorId))
    .get()

  if (!creator || creator.role !== 'creator') {
    return notFound(c, 'Creator not found')
  }

  const subscriberId = c.var.user.id
  if (subscriberId === creatorId) return conflict(c, 'You cannot subscribe to yourself')

  try {
    await db.insert(follows).values({ followerId: subscriberId, followeeId: creatorId }).run()
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('unique')) {
      return conflict(c, 'Already subscribed to this creator')
    }
    throw err
  }

  let plan = await db
    .select()
    .from(membershipPlans)
    .where(eq(membershipPlans.creatorId, creatorId))
    .get()

  if (!plan) {
    const planId = crypto.randomUUID()
    await db
      .insert(membershipPlans)
      .values({
        id: planId,
        creatorId,
        freePermanentEnabled: true,
      })
      .run()
    plan = await db.select().from(membershipPlans).where(eq(membershipPlans.id, planId)).get()
  }

  if (plan) {
    await db
      .insert(subscriptionMemberships)
      .values({
        id: crypto.randomUUID(),
        creatorId,
        subscriberId,
        planId: plan.id,
        provider: 'internal',
        accessType: 'free',
        status: 'active',
      })
      .onConflictDoUpdate({
        target: [subscriptionMemberships.subscriberId, subscriptionMemberships.creatorId],
        set: {
          planId: plan.id,
          provider: 'internal',
          accessType: 'free',
          interval: null,
          status: 'active',
          trialEndsAt: null,
          updatedAt: new Date(),
        },
      })
      .run()
  }

  return c.json({ subscriberId, creatorId }, 201)
})
