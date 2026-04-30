import { Hono } from 'hono'
import { desc, eq } from 'drizzle-orm'
import { createDb } from '../db/client'
import { posts, follows, users } from '../db/schema'
import { authMiddleware, requireRole, type HonoEnv } from '../middleware/auth'

export const feedRoutes = new Hono<HonoEnv>()

// ── GET / ──────────────────────────────────────────────────────────────────

feedRoutes.get('/', authMiddleware, requireRole('subscriber'), async (c) => {
  const db = createDb(c.env.DB)

  const rows = await db
    .select({
      id: posts.id,
      body: posts.body,
      createdAt: posts.createdAt,
      authorDisplayName: users.displayName,
      authorUsername: users.username,
    })
    .from(posts)
    .innerJoin(follows, eq(follows.followeeId, posts.authorId))
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(eq(follows.followerId, c.var.user.id))
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

feedRoutes.post('/subscribe', authMiddleware, requireRole('subscriber'), async (c) => {
  let body: { creatorId?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 422)
  }

  const { creatorId } = body as { creatorId: string }

  if (!creatorId || typeof creatorId !== 'string') {
    return c.json({ error: 'creatorId is required' }, 422)
  }

  const db = createDb(c.env.DB)

  // Verify the target user exists and is a creator
  const creator = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, creatorId))
    .get()

  if (!creator || creator.role !== 'creator') {
    return c.json({ error: 'Creator not found' }, 404)
  }

  const subscriberId = c.var.user.id

  try {
    await db.insert(follows).values({ followerId: subscriberId, followeeId: creatorId }).run()
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('unique')) {
      return c.json({ error: 'Already subscribed to this creator' }, 409)
    }
    throw err
  }

  return c.json({ subscriberId, creatorId }, 201)
})
