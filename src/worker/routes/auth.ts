import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { createDb } from '../db/client'
import { users } from '../db/schema'
import { generateUsername } from '../lib/validators'
import { createAuth, type AppAuth } from '../lib/auth'
import { authMiddleware, type HonoEnv } from '../middleware/auth'
import { authLoginSchema, authRegisterSchema } from '../lib/schemas'
import { conflict, notFound, zodHook } from '../lib/http'

export const authRoutes = new Hono<HonoEnv>()

type BetterAuthUser = {
  id: string
  email: string
  name: string
  role?: 'subscriber' | 'creator'
  username?: string
}

function copySetCookie(source: Headers, target: Headers) {
  const headersWithCookies = source as Headers & { getSetCookie?: () => string[] }
  const cookies = headersWithCookies.getSetCookie?.()

  if (cookies?.length) {
    for (const cookie of cookies) target.append('Set-Cookie', cookie)
    return
  }

  const cookie = source.get('Set-Cookie')
  if (cookie) target.append('Set-Cookie', cookie)
}

function jsonWithAuthCookies(source: Response, body: unknown, status = source.status) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  copySetCookie(source.headers, headers)
  return new Response(JSON.stringify(body), { status, headers })
}

async function callAuthEndpoint(
  c: Context<HonoEnv>,
  auth: AppAuth,
  path: string,
  body?: unknown,
) {
  const url = new URL(c.req.url)
  url.pathname = `/api/auth/${path}`
  url.search = ''

  const headers = new Headers(c.req.raw.headers)
  headers.set('Accept', 'application/json')
  headers.set('Content-Type', 'application/json')

  return auth.handler(new Request(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
  }))
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return await response.clone().json() as T
  } catch {
    return null
  }
}

function toLegacyUser(user: BetterAuthUser) {
  return {
    id: user.id,
    email: user.email,
    role: user.role ?? 'subscriber',
    displayName: user.name,
    username: user.username ?? '',
  }
}

// ── POST /register ─────────────────────────────────────────────────────────

authRoutes.post('/register', zValidator('json', authRegisterSchema, zodHook), async (c) => {
  const { email, password } = c.req.valid('json')
  const db = createDb(c.env.DB)
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get()
  if (existing) {
    return conflict(c, 'Email already in use')
  }

  const auth = createAuth(c.env, new URL(c.req.url).origin)
  const localPart = email.split('@')[0]
  const displayName = localPart
  const username = generateUsername(localPart)
  const authResponse = await callAuthEndpoint(c, auth, 'sign-up/email', {
    email,
    password,
    name: displayName,
    role: 'subscriber',
    username,
  })

  const json = await readJson<{ user?: BetterAuthUser; message?: string }>(authResponse)

  if (!authResponse.ok || !json?.user) {
    return jsonWithAuthCookies(
      authResponse,
      { error: { code: 'registration_failed', message: json?.message ?? 'Registration failed' } },
      authResponse.status === 422 ? 409 : authResponse.status,
    )
  }

  return jsonWithAuthCookies(authResponse, toLegacyUser(json.user), 201)
})

// ── POST /login ────────────────────────────────────────────────────────────

authRoutes.post('/login', zValidator('json', authLoginSchema, zodHook), async (c) => {
  const { email, password } = c.req.valid('json')
  const auth = createAuth(c.env, new URL(c.req.url).origin)
  const authResponse = await callAuthEndpoint(c, auth, 'sign-in/email', {
    email,
    password,
  })

  const json = await readJson<{ user?: BetterAuthUser }>(authResponse)

  if (!authResponse.ok || !json?.user) {
    return jsonWithAuthCookies(authResponse, { error: { code: 'invalid_credentials', message: 'Invalid email or password' } }, 401)
  }

  return jsonWithAuthCookies(authResponse, toLegacyUser(json.user))
})

// ── POST /logout ───────────────────────────────────────────────────────────

authRoutes.post('/logout', authMiddleware, async (c) => {
  const auth = createAuth(c.env, new URL(c.req.url).origin)
  const authResponse = await callAuthEndpoint(c, auth, 'sign-out')
  return jsonWithAuthCookies(authResponse, { message: 'Logged out' })
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
    return notFound(c, 'User not found')
  }

  return c.json(user)
})

// ── Better Auth native endpoints ───────────────────────────────────────────

authRoutes.on(['GET', 'POST'], '/*', (c) => {
  const auth = createAuth(c.env, new URL(c.req.url).origin)
  return auth.handler(c.req.raw)
})
