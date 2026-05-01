import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { createDb } from '../db/client'
import { posts } from '../db/schema'
import { authMiddleware, requireRole, type HonoEnv } from '../middleware/auth'
import { postCreateSchema } from '../lib/schemas'
import { zodHook } from '../lib/http'

export const postsRoutes = new Hono<HonoEnv>()

// ── POST / ─────────────────────────────────────────────────────────────────

postsRoutes.post('/', authMiddleware, requireRole('creator'), zValidator('json', postCreateSchema, zodHook), async (c) => {
  const { body: postBody } = c.req.valid('json')
  const db = createDb(c.env.DB)
  const id = crypto.randomUUID()
  const authorId = c.var.user.id

  // Insert into posts table and return the inserted row
  const inserted = await db
    .insert(posts)
    .values({ id, authorId, body: postBody })
    .returning({
      id: posts.id,
      body: posts.body,
      createdAt: posts.createdAt,
    })
    .get()

  // createdAt is stored as Unix seconds (unixepoch()); drizzle mode:'timestamp'
  // returns a Date — convert back to the raw integer seconds value.
  const createdAtSeconds = Math.floor((inserted.createdAt as Date).getTime() / 1000)

  return c.json(
    {
      id: inserted.id,
      body: inserted.body,
      createdAt: createdAtSeconds,
    },
    201,
  )
})
