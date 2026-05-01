import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, and, not } from 'drizzle-orm'
import { createDb } from '../db/client'
import { account, users } from '../db/schema'
import { hashPassword, verifyPassword } from '../lib/crypto'
import { authMiddleware, type HonoEnv } from '../middleware/auth'
import {
  emailSettingsSchema,
  passwordSettingsSchema,
  profileSettingsSchema,
  usernameSettingsSchema,
} from '../lib/schemas'
import {
  conflict,
  errorResponse,
  notFound,
  payloadTooLarge,
  unauthorized,
  unsupportedMediaType,
  zodHook,
} from '../lib/http'

export const settingsRoutes = new Hono<HonoEnv>()

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
    await c.env.AVATARS.delete(existing.avatarR2Key)
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
  await c.env.AVATARS.put(r2Key, await file.arrayBuffer(), {
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

settingsRoutes.put('/password', authMiddleware, zValidator('json', passwordSettingsSchema, zodHook), async (c) => {
  const userId = c.var.user.id
  const { currentPassword, newPassword } = c.req.valid('json')

  const db = createDb(c.env.DB)

  const credentialAccount = await db
    .select({ id: account.id, password: account.password })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
    .get()

  if (!credentialAccount?.password) {
    return notFound(c, 'Credential account not found')
  }

  // Verify current password
  const currentOk = await verifyPassword(currentPassword, credentialAccount.password)
  if (!currentOk) {
    return unauthorized(c, 'Current password is incorrect')
  }

  // Validate new password is different from current
  if (newPassword === currentPassword) {
    return errorResponse(c, 422, 'validation_failed', 'New password must be different from current password')
  }

  const newHash = await hashPassword(newPassword)

  await db.batch([
    db.update(account).set({ password: newHash }).where(eq(account.id, credentialAccount.id)),
    db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId)),
  ])

  return c.json({ message: 'Password updated' })
})

// ── PUT /email ─────────────────────────────────────────────────────────────

settingsRoutes.put('/email', authMiddleware, zValidator('json', emailSettingsSchema, zodHook), async (c) => {
  const userId = c.var.user.id
  const { newEmail, currentPassword } = c.req.valid('json')

  const db = createDb(c.env.DB)

  // Fetch current user's email and credential password hash
  const currentUser = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .get()

  if (!currentUser) {
    return notFound(c, 'User not found')
  }

  const credentialAccount = await db
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
    .get()

  if (!credentialAccount?.password) {
    return notFound(c, 'Credential account not found')
  }

  // Idempotency: same email -> verify password, return 200 without DB write
  if (newEmail === currentUser.email) {
    const passwordOk = await verifyPassword(currentPassword, credentialAccount.password)
    if (!passwordOk) return unauthorized(c, 'Current password is incorrect')
    return c.json({ message: 'Email unchanged' })
  }

  // Only check uniqueness when the email is actually changing
  const emailTaken = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, newEmail))
    .get()

  if (emailTaken) {
    return conflict(c, 'Email already in use')
  }

  const passwordOk = await verifyPassword(currentPassword, credentialAccount.password)
  if (!passwordOk) {
    return unauthorized(c, 'Current password is incorrect')
  }

  await db
    .update(users)
    .set({ email: newEmail })
    .where(eq(users.id, userId))
    .run()

  return c.json({ message: 'Email updated' })
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
