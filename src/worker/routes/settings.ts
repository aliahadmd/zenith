import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, and, not } from 'drizzle-orm'
import { createDb } from '../db/client'
import { creatorProfileTabs, users } from '../db/schema'
import {
  deleteEmailChangeOtp,
  generateOtp,
  storeEmailChangeOtp,
  verifyEmailChangeOtp,
} from '../lib/auth-otp'
import { sendTransactionalEmail } from '../lib/email'
import { authMiddleware, requireRole, type HonoEnv } from '../middleware/auth'
import {
  emailSettingsSchema,
  emailSettingsVerifySchema,
  profileTabsSettingsSchema,
  profileSettingsSchema,
  usernameSettingsSchema,
} from '../lib/schemas'
import {
  conflict,
  errorResponse,
  notFound,
  payloadTooLarge,
  unsupportedMediaType,
  zodHook,
} from '../lib/http'
import { getCreatorProfileTabs } from '../lib/profile-tabs'

export const settingsRoutes = new Hono<HonoEnv>()

// ── GET/PUT /profile-tabs ─────────────────────────────────────────────────

settingsRoutes.get('/profile-tabs', authMiddleware, requireRole('creator'), async (c) => {
  const db = createDb(c.env.DB)
  return c.json({ tabs: await getCreatorProfileTabs(db, c.var.user.id) })
})

settingsRoutes.put('/profile-tabs', authMiddleware, requireRole('creator'), zValidator('json', profileTabsSettingsSchema, zodHook), async (c) => {
  const { tabs } = c.req.valid('json')
  const db = createDb(c.env.DB)

  for (const [index, tab] of tabs.entries()) {
    await db
      .insert(creatorProfileTabs)
      .values({
        creatorId: c.var.user.id,
        tabKey: tab.key,
        visible: tab.visible,
        displayOrder: index,
      })
      .onConflictDoUpdate({
        target: [creatorProfileTabs.creatorId, creatorProfileTabs.tabKey],
        set: {
          visible: tab.visible,
          displayOrder: index,
          updatedAt: new Date(),
        },
      })
  }

  return c.json({ tabs: await getCreatorProfileTabs(db, c.var.user.id) })
})

// ── PUT /avatar ────────────────────────────────────────────────────────────

settingsRoutes.put('/avatar', authMiddleware, async (c) => {
  const userId = c.var.user.id

  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    return errorResponse(c, 422, 'validation_failed', 'Invalid multipart/form-data body')
  }

  const file = formData.get('avatar') as File | null

  if (!file) {
    return errorResponse(c, 422, 'validation_failed', 'Missing avatar file')
  }

  // Validate Content-Type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    return unsupportedMediaType(c, 'Unsupported media type. Must be image/jpeg, image/png, or image/webp')
  }

  // Validate file size (≤ 5 MB)
  const maxSize = 5_242_880
  if (file.size > maxSize) {
    return payloadTooLarge(c, 'File too large. Maximum size is 5 MB')
  }

  const db = createDb(c.env.DB)

  // Read existing avatar_r2_key and delete from R2 if present
  const existing = await db
    .select({ avatarR2Key: users.avatarR2Key })
    .from(users)
    .where(eq(users.id, userId))
    .get()

  if (existing?.avatarR2Key) {
    await c.env.STORAGE.delete(existing.avatarR2Key)
  }

  // Determine extension from content type
  const extMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  }
  const ext = extMap[file.type]

  const r2Key = `avatars/${userId}${ext}`
  const avatarUrl = `/api/profile/avatar/${userId}`

  // Upload new object to R2
  await c.env.STORAGE.put(r2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  })

  // Update DB
  await db
    .update(users)
    .set({ avatarUrl, avatarR2Key: r2Key })
    .where(eq(users.id, userId))
    .run()

  return c.json({ avatarUrl })
})

// ── PUT /password ──────────────────────────────────────────────────────────

settingsRoutes.put('/password', authMiddleware, async (c) => {
  return errorResponse(
    c,
    400,
    'password_auth_disabled',
    'Zenith now uses email sign-in codes instead of account passwords.',
  )
})

// ── POST /email/otp/request ────────────────────────────────────────────────

settingsRoutes.post('/email/otp/request', authMiddleware, zValidator('json', emailSettingsSchema, zodHook), async (c) => {
  const userId = c.var.user.id
  const { newEmail } = c.req.valid('json')

  const db = createDb(c.env.DB)

  const currentUser = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .get()

  if (!currentUser) {
    return notFound(c, 'User not found')
  }

  if (newEmail === currentUser.email) {
    return c.json({ success: true })
  }

  const emailTaken = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, newEmail))
    .get()

  if (emailTaken) {
    return conflict(c, 'Email already in use')
  }

  const otp = generateOtp()
  await storeEmailChangeOtp(db, userId, newEmail, otp)

  try {
    await sendTransactionalEmail(c.env, {
      to: newEmail,
      subject: 'Confirm your Zenith email',
      text: [
        `Your Zenith email change code is ${otp}.`,
        '',
        'This code expires in 5 minutes. If you did not request it, keep your current email unchanged.',
      ].join('\n'),
    })
  } catch (error) {
    await deleteEmailChangeOtp(db, userId, newEmail)
    console.error('Email change OTP delivery failed:', error)
    return errorResponse(
      c,
      503,
      'otp_email_unavailable',
      'Email change code could not be sent. Try a verified Email Routing recipient.',
    )
  }

  return c.json({ success: true })
})

// ── POST /email/otp/verify ─────────────────────────────────────────────────

settingsRoutes.post('/email/otp/verify', authMiddleware, zValidator('json', emailSettingsVerifySchema, zodHook), async (c) => {
  const userId = c.var.user.id
  const { newEmail, otp } = c.req.valid('json')

  const db = createDb(c.env.DB)

  const currentUser = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .get()

  if (!currentUser) {
    return notFound(c, 'User not found')
  }

  if (newEmail === currentUser.email) {
    await deleteEmailChangeOtp(db, userId, newEmail)
    return c.json({ message: 'Email unchanged', email: newEmail })
  }

  const emailTaken = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, newEmail))
    .get()

  if (emailTaken) {
    return conflict(c, 'Email already in use')
  }

  const otpResult = await verifyEmailChangeOtp(db, userId, newEmail, otp)
  if (!otpResult.ok) {
    const message = otpResult.code === 'too_many_attempts'
      ? 'Too many incorrect codes. Request a new email change code.'
      : otpResult.code === 'otp_expired'
        ? 'That code has expired. Request a new email change code.'
        : 'That code is invalid.'
    return errorResponse(c, otpResult.code === 'too_many_attempts' ? 403 : 400, otpResult.code, message)
  }

  await db
    .update(users)
    .set({ email: newEmail, emailVerified: true })
    .where(eq(users.id, userId))
    .run()

  return c.json({ message: 'Email updated', email: newEmail })
})

// ── PUT /email disabled ───────────────────────────────────────────────────

settingsRoutes.put('/email', authMiddleware, async (c) => {
  return errorResponse(
    c,
    400,
    'password_auth_disabled',
    'Use the email code flow to update your email address.',
  )
})

// ── PUT /username ──────────────────────────────────────────────────────────

settingsRoutes.put('/username', authMiddleware, zValidator('json', usernameSettingsSchema, zodHook), async (c) => {
  const userId = c.var.user.id
  const { newUsername } = c.req.valid('json')

  const db = createDb(c.env.DB)

  const currentUser = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .get()

  if (!currentUser) return notFound(c, 'User not found')

  if (newUsername === currentUser.username) {
    return c.json({ message: 'Username unchanged' })
  }

  const taken = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, newUsername), not(eq(users.id, userId))))
    .get()

  if (taken) {
    return conflict(c, 'Username is already taken')
  }

  await db
    .update(users)
    .set({ username: newUsername })
    .where(eq(users.id, userId))
    .run()

  return c.json({ username: newUsername })
})

// ── PUT /profile ───────────────────────────────────────────────────────────

settingsRoutes.put('/profile', authMiddleware, zValidator('json', profileSettingsSchema, zodHook), async (c) => {
  const userId = c.var.user.id
  const { displayName, tagline, socialLinks } = c.req.valid('json')

  const db = createDb(c.env.DB)

  await db
    .update(users)
    .set({
      displayName: displayName.trim(),
      tagline: tagline ?? null,
      socialLinks: socialLinks ? JSON.stringify(socialLinks) : null,
    })
    .where(eq(users.id, userId))
    .run()

  return c.json({ displayName: displayName.trim(), tagline, socialLinks })
})
