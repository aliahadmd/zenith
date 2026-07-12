import { createMiddleware } from 'hono/factory'
import { forbidden } from '../lib/http'
import type { HonoEnv } from './auth'

export const adminMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  if (!c.var.user.adminRole) return forbidden(c, 'Administrator access required')
  await next()
})

export const ownerMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  if (c.var.user.adminRole !== 'owner') return forbidden(c, 'Owner access required')
  await next()
})
