import { Hono } from 'hono'
import { createDb } from '../db/client'
import { posts } from '../db/schema'
import { authMiddleware, requireRole, type HonoEnv } from '../middleware/auth'

export const postsRoutes = new Hono<HonoEnv>()

// ── POST / ─────────────────────────────────────────────────────────────────

postsRoutes.post('/', authMiddleware, requireRole('creator'), async (c) => {
  // Parse JSON body
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Post body must be between 1 and 500 characters' }, 422)
  }

  // Validate body field
  const postBody = (body as Record<string, unknown>)?.body
  if (
    typeof postBody !== 'string' ||
    postBody.length < 1 ||
    postBody.length > 500
  ) {
    return c.json({ error: 'Post body must be between 1 and 500 characters' }, 422)
  }

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
