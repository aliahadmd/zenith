import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { createDb } from '../db/client'
import { adminMemberships, users } from '../db/schema'
import { generateUsername } from '../lib/validators'
import { createAuth, type AppAuth } from '../lib/auth'
import { authMiddleware, type HonoEnv } from '../middleware/auth'
import {
  authLoginSchema,
  authRegisterSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../lib/schemas'
import { errorResponse, notFound, zodHook } from '../lib/http'

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

function logAuthEndpointError(operation: string, error: unknown) {
  const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
    ? Number((error as { statusCode?: number }).statusCode)
    : undefined
  const code = typeof error === 'object' && error !== null && 'body' in error
    ? (error as { body?: { code?: string } }).body?.code
    : undefined
  const message = error instanceof Error ? error.message : String(error)
  console.error(JSON.stringify({ event: 'auth_endpoint_error', operation, statusCode, code, message }))
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

async function generateUniqueUsername(db: ReturnType<typeof createDb>, email: string) {
  const localPart = email.split('@')[0]
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const username = generateUsername(localPart)
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).get()
    if (!existing) return username
  }
  return `u-${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`
}

function displayNameFromEmail(email: string) {
  return email.split('@')[0].replace(/[._-]+/g, ' ').trim() || 'Zenith member'
}

const blockedNativeAuthPaths = new Set([
  'sign-in/email',
  'sign-up/email',
  'sign-in/email-otp',
  'email-otp/send-verification-otp',
  'email-otp/create-verification-otp',
  'email-otp/get-verification-otp',
  'email-otp/check-verification-otp',
  'email-otp/verify-email',
  'email-otp/request-password-reset',
  'email-otp/reset-password',
  'forget-password/email-otp',
  'email-otp/request-email-change',
  'email-otp/change-email',
  'request-password-reset',
  'reset-password',
  'send-verification-email',
  'change-password',
  'verify-password',
])

function isBlockedNativeAuthPath(requestUrl: string) {
  const pathname = new URL(requestUrl).pathname
  const path = pathname.replace(/^\/api\/auth\/?/, '').replace(/^\/+/, '')
  // Exact matches only: GET /reset-password/:token must stay reachable because
  // password-reset emails link to it — it validates the token and redirects
  // into the SPA. The native POST /reset-password (exact match in the set)
  // stays blocked behind the custom endpoint of the same path.
  return blockedNativeAuthPaths.has(path)
}

// ── POST /register ─────────────────────────────────────────────────────────
// Password sign-up with mandatory email verification. Role and username are
// assigned server-side; the native sign-up endpoint stays blocked so a caller
// can never self-assign a role.

authRoutes.post('/register', zValidator('json', authRegisterSchema, zodHook), async (c) => {
  const { email, password } = c.req.valid('json')
  const db = createDb(c.env.DB)
  const auth = createAuth(c.env, new URL(c.req.url).origin)

  let authResponse: Response
  try {
    authResponse = await callAuthEndpoint(c, auth, 'sign-up/email', {
      email,
      password,
      name: displayNameFromEmail(email),
      username: await generateUniqueUsername(db, email),
    })
  } catch (error) {
    logAuthEndpointError('register', error)
    return errorResponse(c, 500, 'internal_server_error', 'Could not create the account. Try again.')
  }

  if (!authResponse.ok) {
    const native = await readJson<{ code?: string; message?: string }>(authResponse)
    return jsonWithAuthCookies(authResponse, {
      error: {
        code: native?.code ?? 'registration_failed',
        message: native?.message ?? 'Could not create the account. Try again.',
      },
    })
  }

  // No session cookies are forwarded: accounts stay signed out until the
  // email address is verified.
  return c.json({ success: true, email })
})

// ── POST /login ────────────────────────────────────────────────────────────

authRoutes.post('/login', zValidator('json', authLoginSchema, zodHook), async (c) => {
  const { email, password } = c.req.valid('json')
  const db = createDb(c.env.DB)
  const existing = await db
    .select({ accountStatus: users.accountStatus })
    .from(users)
    .where(eq(users.email, email))
    .get()
  if (existing?.accountStatus === 'suspended') {
    return errorResponse(c, 403, 'account_suspended', 'This account is suspended.')
  }

  const auth = createAuth(c.env, new URL(c.req.url).origin)
  let authResponse: Response
  try {
    authResponse = await callAuthEndpoint(c, auth, 'sign-in/email', { email, password })
  } catch (error) {
    logAuthEndpointError('login', error)
    return errorResponse(c, 500, 'internal_server_error', 'Sign-in failed. Try again.')
  }

  if (!authResponse.ok) {
    if (authResponse.status === 403) {
      return jsonWithAuthCookies(authResponse, {
        error: {
          code: 'email_not_verified',
          message: 'Verify your email before signing in. We sent a fresh verification link to your inbox.',
        },
      }, 403)
    }
    if (authResponse.status === 401) {
      return jsonWithAuthCookies(authResponse, {
        error: { code: 'invalid_credentials', message: 'Incorrect email or password.' },
      }, 401)
    }
    return jsonWithAuthCookies(authResponse, {
      error: { code: 'sign_in_failed', message: 'Sign-in failed. Try again.' },
    })
  }

  const json = await readJson<{ user?: BetterAuthUser }>(authResponse)
  if (!json?.user) {
    return errorResponse(c, 500, 'sign_in_failed', 'Sign-in failed. Try again.')
  }
  return jsonWithAuthCookies(authResponse, toLegacyUser(json.user))
})

// ── POST /resend-verification ──────────────────────────────────────────────
// Always succeeds without revealing whether the address is registered.

authRoutes.post('/resend-verification', zValidator('json', forgotPasswordSchema, zodHook), async (c) => {
  const { email } = c.req.valid('json')
  const auth = createAuth(c.env, new URL(c.req.url).origin)

  let authResponse: Response
  try {
    authResponse = await callAuthEndpoint(c, auth, 'send-verification-email', {
      email,
      callbackURL: '/login?verified=1',
    })
  } catch {
    return errorResponse(c, 503, 'verification_email_unavailable', 'Verification email could not be sent. Try again shortly.')
  }
  if (!authResponse.ok) {
    return errorResponse(c, 503, 'verification_email_unavailable', 'Verification email could not be sent. Try again shortly.')
  }
  return c.json({ success: true })
})

// ── POST /forgot-password ──────────────────────────────────────────────────
// Always succeeds without revealing whether the address is registered.

authRoutes.post('/forgot-password', zValidator('json', forgotPasswordSchema, zodHook), async (c) => {
  const { email } = c.req.valid('json')
  const origin = new URL(c.req.url).origin
  const auth = createAuth(c.env, origin)

  let authResponse: Response
  try {
    authResponse = await callAuthEndpoint(c, auth, 'request-password-reset', {
      email,
      redirectTo: `${origin}/reset-password`,
    })
  } catch {
    return errorResponse(c, 503, 'reset_email_unavailable', 'Reset email could not be sent. Try again shortly.')
  }
  if (!authResponse.ok) {
    return errorResponse(c, 503, 'reset_email_unavailable', 'Reset email could not be sent. Try again shortly.')
  }
  return c.json({ success: true })
})

// ── POST /reset-password ───────────────────────────────────────────────────

authRoutes.post('/reset-password', zValidator('json', resetPasswordSchema, zodHook), async (c) => {
  const { token, password } = c.req.valid('json')
  const auth = createAuth(c.env, new URL(c.req.url).origin)

  let authResponse: Response
  try {
    authResponse = await callAuthEndpoint(c, auth, 'reset-password', {
      newPassword: password,
      token,
    })
  } catch (error) {
    logAuthEndpointError('reset-password', error)
    return errorResponse(c, 400, 'invalid_reset_token', 'This reset link is invalid or has expired. Request a new one.')
  }

  if (!authResponse.ok) {
    return jsonWithAuthCookies(authResponse, {
      error: { code: 'invalid_reset_token', message: 'This reset link is invalid or has expired. Request a new one.' },
    }, 400)
  }
  return jsonWithAuthCookies(authResponse, { success: true })
})

// ── POST /change-password ──────────────────────────────────────────────────

authRoutes.post('/change-password', authMiddleware, zValidator('json', changePasswordSchema, zodHook), async (c) => {
  const { currentPassword, newPassword } = c.req.valid('json')
  const auth = createAuth(c.env, new URL(c.req.url).origin)

  let authResponse: Response
  try {
    authResponse = await callAuthEndpoint(c, auth, 'change-password', {
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    })
  } catch (error) {
    logAuthEndpointError('change-password', error)
    return errorResponse(c, 500, 'internal_server_error', 'Could not change the password. Try again.')
  }

  if (!authResponse.ok) {
    const native = await readJson<{ code?: string; message?: string }>(authResponse)
    logAuthEndpointError('change-password', { statusCode: authResponse.status, body: native })
    const unauthorized = authResponse.status === 401
    return jsonWithAuthCookies(authResponse, {
      error: {
        code: unauthorized ? 'invalid_current_password' : 'change_password_failed',
        message: unauthorized ? 'Your current password is incorrect.' : native?.message ?? 'Could not change the password. Try again.',
      },
    }, unauthorized ? 401 : authResponse.status)
  }
  return jsonWithAuthCookies(authResponse, { success: true })
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
      adminRole: adminMemberships.role,
    })
    .from(users)
    .leftJoin(adminMemberships, eq(adminMemberships.userId, users.id))
    .where(eq(users.id, c.var.user.id))
    .get()

  if (!user) {
    return notFound(c, 'User not found')
  }

  return c.json(user)
})

// ── Better Auth native endpoints ───────────────────────────────────────────
// The email link in verification messages is the one native GET that stays
// reachable (verify-email); everything that could mutate credentials is
// wrapped above or blocked outright.

authRoutes.on(['GET', 'POST'], '/*', (c) => {
  if (isBlockedNativeAuthPath(c.req.url)) return notFound(c)

  const auth = createAuth(c.env, new URL(c.req.url).origin)
  return auth.handler(c.req.raw)
})
