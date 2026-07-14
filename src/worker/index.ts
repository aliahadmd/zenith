import { Hono } from 'hono'
import { type HonoEnv } from './middleware/auth'
import { authRoutes } from './routes/auth'
import { feedRoutes } from './routes/feed'
import { profileRoutes } from './routes/profile'
import { settingsRoutes } from './routes/settings'
import { creatorRoutes } from './routes/creator'
import { mediaRoutes, pollsRoutes, postsRoutes, repliesRoutes } from './routes/posts'
import { articlesRoutes } from './routes/articles'
import { audioRoutes } from './routes/audio'
import { photographyRoutes } from './routes/photography'
import { paymentsRoutes } from './routes/payments'
import { notificationsRoutes } from './routes/notifications'
import { coursesRoutes } from './routes/courses'
import { adminRoutes } from './routes/admin'
import { reportRoutes } from './routes/reports'
import { libraryRoutes } from './routes/library'
import { schedulesRoutes } from './routes/schedules'
import { discoveryRoutes } from './routes/discovery'
import { notFound, serverError } from './lib/http'
import { processDueSchedules } from './lib/scheduling'
import { processMembershipMaintenance } from './lib/memberships'

export const app = new Hono<HonoEnv>()

app.route('/api/auth', authRoutes)
app.route('/api/feed', feedRoutes)
app.route('/api/profile', profileRoutes)
app.route('/api/settings', settingsRoutes)
app.route('/api/creator', creatorRoutes)
app.route('/api/posts', postsRoutes)
app.route('/api/articles', articlesRoutes)
app.route('/api/audio', audioRoutes)
app.route('/api/photography', photographyRoutes)
app.route('/api/replies', repliesRoutes)
app.route('/api/polls', pollsRoutes)
app.route('/api/media', mediaRoutes)
app.route('/api/payments', paymentsRoutes)
app.route('/api/notifications', notificationsRoutes)
app.route('/api/courses', coursesRoutes)
app.route('/api/reports', reportRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api/library', libraryRoutes)
app.route('/api/schedules', schedulesRoutes)
app.route('/api/discovery', discoveryRoutes)

app.onError((err, c) => {
  console.error(err)
  return serverError(c)
})

app.notFound((c) => {
  const url = new URL(c.req.url)
  if (url.pathname.startsWith('/api/')) return notFound(c)

  const assets = (c.env as Env & { ASSETS?: { fetch: typeof fetch } }).ASSETS
  if (assets) return assets.fetch(c.req.raw)

  return notFound(c)
})

export default {
  fetch: app.fetch,
  scheduled(controller, env, ctx) {
    ctx.waitUntil(Promise.all([
      processDueSchedules(env, controller.scheduledTime),
      processMembershipMaintenance(env, controller.scheduledTime),
    ]))
  },
} satisfies ExportedHandler<Env>
