import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, and } from 'drizzle-orm'
import { createDb } from '../db/client'
import { users, follows } from '../db/schema'
import { type HonoEnv } from '../middleware/auth'
import { userIdParamSchema, usernameParamSchema } from '../lib/schemas'
import { notFound, zodHook } from '../lib/http'

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

  const subscriptions = await db
    .select({
      displayName: users.displayName,
      username: users.username,
      avatarUrl: users.avatarUrl,
    })
    .from(follows)
    .innerJoin(users, eq(users.id, follows.followeeId))
    .where(and(eq(follows.followerId, user.id), eq(users.role, 'creator')))
    .all()

  return c.json({ subscriptions })
})
