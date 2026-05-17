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
import { paymentsRoutes } from './routes/payments'
import { notFound, serverError } from './lib/http'

const app = new Hono<HonoEnv>()

app.route('/api/auth', authRoutes)
app.route('/api/feed', feedRoutes)
app.route('/api/profile', profileRoutes)
app.route('/api/settings', settingsRoutes)
app.route('/api/creator', creatorRoutes)
app.route('/api/posts', postsRoutes)
app.route('/api/articles', articlesRoutes)
app.route('/api/audio', audioRoutes)
app.route('/api/replies', repliesRoutes)
app.route('/api/polls', pollsRoutes)
app.route('/api/media', mediaRoutes)
app.route('/api/payments', paymentsRoutes)

app.onError((err, c) => {
  console.error(err)
  return serverError(c)
})

app.notFound((c) => notFound(c))

export default app
