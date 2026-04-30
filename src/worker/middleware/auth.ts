import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { verifyJwt } from '../lib/crypto'

export type HonoEnv = {
  Bindings: Env
  Variables: {
    user: { id: string; email: string; role: 'subscriber' | 'creator' }
  }
}

export const authMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const token = getCookie(c, 'session')
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  const payload = await verifyJwt(token, c.env.JWT_SECRET)
  if (!payload) return c.json({ error: 'Unauthorized' }, 401)

  c.set('user', { id: payload.sub, email: payload.email, role: payload.role })
  await next()
})

export const requireRole = (role: 'subscriber' | 'creator') =>
  createMiddleware<HonoEnv>(async (c, next) => {
    if (c.var.user.role !== role) return c.json({ error: 'Forbidden' }, 403)
    await next()
  })
