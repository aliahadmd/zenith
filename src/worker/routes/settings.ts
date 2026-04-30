import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { createDb } from '../db/client'
import { users } from '../db/schema'
import { hashPassword, verifyPassword } from '../lib/crypto'
import { isValidEmail } from '../lib/validators'
import { authMiddleware, type HonoEnv } from '../middleware/auth'

export const settingsRoutes = new Hono<HonoEnv>()

// ── PUT /avatar ────────────────────────────────────────────────────────────

settingsRoutes.put('/avatar', authMiddleware, async (c) => {
  const userId = c.var.user.id

  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    return c.json({ error: 'Invalid multipart/form-data body' }, 422)
  }

  const file = formData.get('avatar') as File | null

  if (!file) {
    return c.json({ error: 'Missing avatar file' }, 422)
  }

  // Validate Content-Type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: 'Unsupported media type. Must be image/jpeg, image/png, or image/webp' }, 415)
  }

  // Validate file size (≤ 5 MB)
  const maxSize = 5_242_880
  if (file.size > maxSize) {
    return c.json({ error: 'File too large. Maximum size is 5 MB' }, 413)
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

settingsRoutes.put('/password', authMiddleware, async (c) => {
  const userId = c.var.user.id

  let body: { currentPassword?: unknown; newPassword?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 422)
  }

  const { currentPassword, newPassword } = body as { currentPassword: string; newPassword: string }

  if (!currentPassword || !newPassword) {
    return c.json({ error: 'currentPassword and newPassword are required' }, 422)
  }

  const db = createDb(c.env.DB)

  const user = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .get()

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  // Verify current password
  const currentOk = await verifyPassword(currentPassword, user.passwordHash)
  if (!currentOk) {
    return c.json({ error: 'Current password is incorrect' }, 401)
  }

  // Validate new password length
  if (newPassword.length < 8) {
    return c.json({ error: 'New password must be at least 8 characters' }, 422)
  }

  // Validate new password is different from current
  if (newPassword === currentPassword) {
    return c.json({ error: 'New password must be different from current password' }, 422)
  }

  const newHash = await hashPassword(newPassword)

  await db
    .update(users)
    .set({ passwordHash: newHash })
    .where(eq(users.id, userId))
    .run()

  return c.json({ message: 'Password updated' })
})

// ── PUT /email ─────────────────────────────────────────────────────────────

settingsRoutes.put('/email', authMiddleware, async (c) => {
  const userId = c.var.user.id

  let body: { newEmail?: unknown; currentPassword?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 422)
  }

  const { newEmail, currentPassword } = body as { newEmail: string; currentPassword: string }

  if (!newEmail || !currentPassword) {
    return c.json({ error: 'newEmail and currentPassword are required' }, 422)
  }

  // Validate email format
  if (!isValidEmail(newEmail)) {
    return c.json({ error: 'Invalid email address' }, 422)
  }

  const db = createDb(c.env.DB)

  // Check if new email is already taken
  const emailTaken = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, newEmail))
    .get()

  if (emailTaken) {
    return c.json({ error: 'Email already in use' }, 409)
  }

  // Fetch user to verify password
  const user = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .get()

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  // Verify current password
  const passwordOk = await verifyPassword(currentPassword, user.passwordHash)
  if (!passwordOk) {
    return c.json({ error: 'Current password is incorrect' }, 401)
  }

  // Update email
  await db
    .update(users)
    .set({ email: newEmail })
    .where(eq(users.id, userId))
    .run()

  return c.json({ message: 'Email updated' })
})
