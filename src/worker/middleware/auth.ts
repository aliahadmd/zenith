import { createMiddleware } from 'hono/factory'
import { eq } from 'drizzle-orm'
import { createDb } from '../db/client'
import { adminMemberships, users } from '../db/schema'
import { createAuth } from '../lib/auth'
import { errorResponse, forbidden, unauthorized } from '../lib/http'

export type AuthenticatedUser = {
  id: string
  email: string
  role: 'subscriber' | 'creator'
  accountStatus: 'active' | 'suspended'
  adminRole: 'owner' | 'moderator' | null
}

export type HonoEnv = {
  Bindings: Env
  Variables: {
    user: AuthenticatedUser
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
      accountStatus: users.accountStatus,
      adminRole: adminMemberships.role,
    })
    .from(users)
    .leftJoin(adminMemberships, eq(adminMemberships.userId, users.id))
    .where(eq(users.id, session.user.id))
    .get()

  if (!user) return unauthorized(c)
  if (user.accountStatus === 'suspended') {
    return errorResponse(c, 403, 'account_suspended', 'This account is suspended.')
  }

  c.set('user', user)
  await next()
})

export const requireRole = (role: 'subscriber' | 'creator') =>
  createMiddleware<HonoEnv>(async (c, next) => {
    if (c.var.user.role !== role) return forbidden(c)
    await next()
  })
