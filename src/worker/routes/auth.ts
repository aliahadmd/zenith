import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { createDb } from '../db/client'
import { users } from '../db/schema'
import { generateUsername } from '../lib/validators'
import { createAuth, type AppAuth } from '../lib/auth'
import { deleteSignInOtp, generateOtp, storeSignInOtp } from '../lib/auth-otp'
import { sendOtpEmail } from '../lib/email'
import { authMiddleware, type HonoEnv } from '../middleware/auth'
import { authOtpRequestSchema, authOtpVerifySchema } from '../lib/schemas'
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

function passwordAuthDisabled(c: Context<HonoEnv>) {
  return errorResponse(
    c,
    400,
    'password_auth_disabled',
    'Password authentication has been replaced by email sign-in codes.',
  )
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
])

function isBlockedNativeAuthPath(requestUrl: string) {
  const pathname = new URL(requestUrl).pathname
  const path = pathname.replace(/^\/api\/auth\/?/, '').replace(/^\/+/, '')
  return blockedNativeAuthPaths.has(path)
}

// ── POST /register and /login disabled ─────────────────────────────────────

authRoutes.post('/register', passwordAuthDisabled)

authRoutes.post('/login', passwordAuthDisabled)

// ── POST /otp/request ──────────────────────────────────────────────────────

authRoutes.post('/otp/request', zValidator('json', authOtpRequestSchema, zodHook), async (c) => {
  const { email } = c.req.valid('json')
  const db = createDb(c.env.DB)
  const otp = generateOtp()

  await storeSignInOtp(db, email, otp)

  try {
    await sendOtpEmail(c.env, email, otp)
  } catch (error) {
    await deleteSignInOtp(db, email)
    console.error('OTP email delivery failed:', error)
    return errorResponse(
      c,
      503,
      'otp_email_unavailable',
      'Sign-in email could not be sent. Try a verified Email Routing recipient.',
    )
  }

  return c.json({ success: true })
})

// ── POST /otp/verify ───────────────────────────────────────────────────────

authRoutes.post('/otp/verify', zValidator('json', authOtpVerifySchema, zodHook), async (c) => {
  const { email, otp } = c.req.valid('json')
  const db = createDb(c.env.DB)
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get()
  const auth = createAuth(c.env, new URL(c.req.url).origin)
  let authResponse: Response
  try {
    authResponse = await callAuthEndpoint(c, auth, 'sign-in/email-otp', {
      email,
      otp,
      name: displayNameFromEmail(email),
      role: 'subscriber',
      username: existing ? undefined : await generateUniqueUsername(db, email),
    })
  } catch (error) {
    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
      ? Number((error as { statusCode?: number }).statusCode)
      : 400
    const code = statusCode === 403 ? 'too_many_otp_attempts' : 'invalid_otp'
    const message = code === 'too_many_otp_attempts'
      ? 'Too many incorrect codes. Request a new sign-in code.'
      : 'The sign-in code is invalid or expired.'
    return errorResponse(c, statusCode === 403 ? 403 : 400, code, message)
  }

  const json = await readJson<{ user?: BetterAuthUser; message?: string }>(authResponse)

  if (!authResponse.ok || !json?.user) {
    const code = authResponse.status === 403 ? 'too_many_otp_attempts' : 'invalid_otp'
    const message = code === 'too_many_otp_attempts'
      ? 'Too many incorrect codes. Request a new sign-in code.'
      : 'The sign-in code is invalid or expired.'
    return jsonWithAuthCookies(authResponse, { error: { code, message } }, authResponse.status === 403 ? 403 : 400)
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
  if (isBlockedNativeAuthPath(c.req.url)) return notFound(c)

  const auth = createAuth(c.env, new URL(c.req.url).origin)
  return auth.handler(c.req.raw)
})
