import { Hono } from 'hono'
import { type HonoEnv } from './middleware/auth'
import { authRoutes } from './routes/auth'
import { feedRoutes } from './routes/feed'
import { profileRoutes } from './routes/profile'
import { settingsRoutes } from './routes/settings'
import { creatorRoutes } from './routes/creator'
import { postsRoutes } from './routes/posts'

const app = new Hono<HonoEnv>()

app.route('/api/auth', authRoutes)
app.route('/api/feed', feedRoutes)
app.route('/api/profile', profileRoutes)
app.route('/api/settings', settingsRoutes)
app.route('/api/creator', creatorRoutes)
app.route('/api/posts', postsRoutes)

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

app.notFound((c) => c.json({ error: 'Not found' }, 404))

export default app
