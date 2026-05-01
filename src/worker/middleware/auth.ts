import { createMiddleware } from 'hono/factory'
import { eq } from 'drizzle-orm'
import { createDb } from '../db/client'
import { users } from '../db/schema'
import { createAuth } from '../lib/auth'
import { forbidden, unauthorized } from '../lib/http'

export type HonoEnv = {
  Bindings: Env
  Variables: {
    user: { id: string; email: string; role: 'subscriber' | 'creator' }
  }
}

export const authMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const auth = createAuth(c.env, new URL(c.req.url).origin)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })

  if (!session) return unauthorized(c)

  const db = createDb(c.env.DB)
  const user = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .get()

  if (!user) return unauthorized(c)

  c.set('user', user)
  await next()
})

export const requireRole = (role: 'subscriber' | 'creator') =>
  createMiddleware<HonoEnv>(async (c, next) => {
    if (c.var.user.role !== role) return forbidden(c)
    await next()
  })
