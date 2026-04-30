import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import { eq } from 'drizzle-orm'
import { createDb } from '../db/client'
import { users } from '../db/schema'
import { hashPassword, verifyPassword, signJwt } from '../lib/crypto'
import { isValidEmail, isValidPassword, generateUsername } from '../lib/validators'
import { authMiddleware, type HonoEnv } from '../middleware/auth'

export const authRoutes = new Hono<HonoEnv>()

// ── Helpers ────────────────────────────────────────────────────────────────

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'Lax' as const,
    path: '/',
    maxAge: 604800, // 7 days
    secure: true,
  }
}

// ── POST /register ─────────────────────────────────────────────────────────

authRoutes.post('/register', async (c) => {
  let body: { email?: unknown; password?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 422)
  }

  const { email, password } = body as { email: string; password: string }

  if (!isValidEmail(email)) {
    return c.json({ error: 'Invalid email address' }, 422)
  }

  if (!isValidPassword(password)) {
    return c.json({ error: 'Password must be at least 8 characters' }, 422)
  }

  const db = createDb(c.env.DB)

  // Check for duplicate email
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get()
  if (existing) {
    return c.json({ error: 'Email already in use' }, 409)
  }

  const passwordHash = await hashPassword(password)
  const id = crypto.randomUUID()
  const localPart = email.split('@')[0]
  const displayName = localPart
  const username = generateUsername(localPart)

  const now = Math.floor(Date.now() / 1000)

  await db
    .insert(users)
    .values({
      id,
      email,
      passwordHash,
      role: 'subscriber',
      displayName,
      username,
    })
    .run()

  const token = await signJwt(
    { sub: id, email, role: 'subscriber', iat: now, exp: now + 604800 },
    c.env.JWT_SECRET
  )

  setCookie(c, 'session', token, cookieOptions())

  return c.json({ id, email, role: 'subscriber', displayName, username }, 201)
})

// ── POST /login ────────────────────────────────────────────────────────────

authRoutes.post('/login', async (c) => {
  let body: { email?: unknown; password?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 422)
  }

  const { email, password } = body as { email: string; password: string }

  const db = createDb(c.env.DB)

  const user = await db.select().from(users).where(eq(users.email, email)).get()

  // Use the same error message for "not found" and "wrong password" to prevent enumeration
  const invalidMsg = { error: 'Invalid email or password' }

  if (!user) {
    return c.json(invalidMsg, 401)
  }

  const passwordOk = await verifyPassword(password, user.passwordHash)
  if (!passwordOk) {
    return c.json(invalidMsg, 401)
  }

  const now = Math.floor(Date.now() / 1000)
  const token = await signJwt(
    { sub: user.id, email: user.email, role: user.role, iat: now, exp: now + 604800 },
    c.env.JWT_SECRET
  )

  setCookie(c, 'session', token, cookieOptions())

  return c.json({
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    username: user.username,
  })
})

// ── POST /logout ───────────────────────────────────────────────────────────

authRoutes.post('/logout', authMiddleware, async (c) => {
  deleteCookie(c, 'session', { path: '/' })
  return c.json({ message: 'Logged out' })
})

// ── GET /me ────────────────────────────────────────────────────────────────

authRoutes.get('/me', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)

  const user = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      displayName: users.displayName,
      username: users.username,
      tagline: users.tagline,
      avatarUrl: users.avatarUrl,
      socialLinks: users.socialLinks,
    })
    .from(users)
    .where(eq(users.id, c.var.user.id))
    .get()

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  return c.json(user)
})
