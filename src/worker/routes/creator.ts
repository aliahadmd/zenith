import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { createDb } from '../db/client'
import { users, creatorApplications } from '../db/schema'
import { authMiddleware, type HonoEnv } from '../middleware/auth'
import { creatorApplicationFieldsSchema } from '../lib/schemas'
import {
  conflict,
  errorResponse,
  payloadTooLarge,
  serverError,
  unsupportedMediaType,
  validationError,
} from '../lib/http'

export const creatorRoutes = new Hono<HonoEnv>()

// ── POST /apply ────────────────────────────────────────────────────────────

creatorRoutes.post('/apply', authMiddleware, async (c) => {
  const userId = c.var.user.id

  // Check if user is already a creator (fast path before parsing body)
  if (c.var.user.role === 'creator') {
    return conflict(c, 'User is already a creator')
  }

  // Parse multipart/form-data
  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    return errorResponse(c, 422, 'validation_failed', 'Invalid multipart/form-data body')
  }

  // Validate nidDocument file presence
  const nidDocumentFile = formData.get('nidDocument') as File | null
  if (!nidDocumentFile || !(nidDocumentFile instanceof File)) {
    return errorResponse(c, 422, 'validation_failed', 'Missing required field: nidDocument')
  }

  const parsedFields = creatorApplicationFieldsSchema.safeParse({
    fullName: readRequiredString(formData, 'fullName'),
    address: readRequiredString(formData, 'address'),
    city: readRequiredString(formData, 'city'),
    country: readRequiredString(formData, 'country'),
    nidNumber: readRequiredString(formData, 'nidNumber'),
    socialLinks: parseJsonArray(formData.get('socialLinks')),
    contentLinks: parseJsonArray(formData.get('contentLinks')),
  })

  if (!parsedFields.success) return validationError(c, parsedFields.error)

  const { fullName, address, city, country, nidNumber, socialLinks, contentLinks } = parsedFields.data

  // Validate NID document MIME type
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedMimeTypes.includes(nidDocumentFile.type)) {
    return unsupportedMediaType(c, 'NID document must be JPEG, PNG, or WebP')
  }

  // Validate NID document size (≤ 10 MB)
  const maxSize = 10 * 1024 * 1024
  if (nidDocumentFile.size > maxSize) {
    return payloadTooLarge(c, 'NID document exceeds 10 MB limit')
  }

  const db = createDb(c.env.DB)

  // Check for existing application (userId has UNIQUE constraint)
  const existingApplication = await db
    .select({ id: creatorApplications.id })
    .from(creatorApplications)
    .where(eq(creatorApplications.userId, userId))
    .get()

  if (existingApplication) {
    return conflict(c, 'Application already submitted')
  }

  // Upload NID document to R2
  const filename = nidDocumentFile.name
  const r2Key = `nid-documents/${userId}/${filename}`

  try {
    await c.env.AVATARS.put(r2Key, await nidDocumentFile.arrayBuffer(), {
      httpMetadata: { contentType: nidDocumentFile.type },
    })
  } catch (err) {
    console.error('R2 upload failed:', err)
    return serverError(c)
  }

  // Atomically insert application and upgrade user role
  try {
    await db.batch([
      db.insert(creatorApplications).values({
        userId,
        fullName,
        address,
        city,
        country,
        nidNumber,
        nidDocumentR2Key: r2Key,
        socialLinks: JSON.stringify(socialLinks),
        contentLinks: JSON.stringify(contentLinks),
        status: 'approved',
      }),
      db.update(users).set({ role: 'creator' }).where(eq(users.id, userId)),
    ])
  } catch (err) {
    console.error('D1 batch write failed:', err)
    // Attempt to clean up the uploaded R2 object
    try {
      await c.env.AVATARS.delete(r2Key)
    } catch {
      // Best-effort cleanup; log but don't surface
      console.error('R2 cleanup after D1 failure also failed for key:', r2Key)
    }
    return serverError(c)
  }

  return c.json({ role: 'creator' }, 201)
})

function readRequiredString(formData: FormData, field: string): string {
  const value = formData.get(field)
  return typeof value === 'string' ? value : ''
}

function parseJsonArray(value: string | File | null): unknown {
  if (typeof value !== 'string') return []
  try {
    return JSON.parse(value)
  } catch {
    return []
  }
}
