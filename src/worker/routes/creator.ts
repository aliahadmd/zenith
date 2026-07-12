import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { createDb } from '../db/client'
import { creatorApplications } from '../db/schema'
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

creatorRoutes.get('/application/me', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const application = await db
    .select({
      id: creatorApplications.id,
      fullName: creatorApplications.fullName,
      address: creatorApplications.address,
      city: creatorApplications.city,
      country: creatorApplications.country,
      nidNumber: creatorApplications.nidNumber,
      socialLinks: creatorApplications.socialLinks,
      contentLinks: creatorApplications.contentLinks,
      status: creatorApplications.status,
      decisionReason: creatorApplications.decisionReason,
      reviewedAt: creatorApplications.reviewedAt,
      resubmittedAt: creatorApplications.resubmittedAt,
      createdAt: creatorApplications.createdAt,
      updatedAt: creatorApplications.updatedAt,
    })
    .from(creatorApplications)
    .where(eq(creatorApplications.userId, c.var.user.id))
    .get()

  if (!application) return c.json({ application: null })
  return c.json({
    application: {
      ...application,
      socialLinks: JSON.parse(application.socialLinks) as string[],
      contentLinks: JSON.parse(application.contentLinks) as string[],
    },
  })
})

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
    .select({
      id: creatorApplications.id,
      status: creatorApplications.status,
      nidDocumentR2Key: creatorApplications.nidDocumentR2Key,
    })
    .from(creatorApplications)
    .where(eq(creatorApplications.userId, userId))
    .get()

  if (existingApplication && existingApplication.status !== 'rejected') {
    return conflict(c, 'Application is already under review')
  }

  // Upload NID document to R2
  const filename = nidDocumentFile.name.replace(/[^a-zA-Z0-9._-]/g, '-')
  const r2Key = `nid-documents/${userId}/${crypto.randomUUID()}-${filename}`

  try {
    await c.env.STORAGE.put(r2Key, await nidDocumentFile.arrayBuffer(), {
      httpMetadata: { contentType: nidDocumentFile.type },
    })
  } catch (err) {
    console.error('R2 upload failed:', err)
    return serverError(c)
  }

  // Persist the pending application before deleting any superseded document.
  try {
    if (existingApplication) {
      await db.update(creatorApplications).set({
        fullName,
        address,
        city,
        country,
        nidNumber,
        nidDocumentR2Key: r2Key,
        socialLinks: JSON.stringify(socialLinks),
        contentLinks: JSON.stringify(contentLinks),
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        decisionReason: null,
        adminNote: null,
        resubmittedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(creatorApplications.id, existingApplication.id)).run()
    } else {
      await db.insert(creatorApplications).values({
        userId,
        fullName,
        address,
        city,
        country,
        nidNumber,
        nidDocumentR2Key: r2Key,
        socialLinks: JSON.stringify(socialLinks),
        contentLinks: JSON.stringify(contentLinks),
        status: 'pending',
      }).run()
    }
  } catch (err) {
    console.error('D1 batch write failed:', err)
    // Attempt to clean up the uploaded R2 object
    try {
      await c.env.STORAGE.delete(r2Key)
    } catch {
      // Best-effort cleanup; log but don't surface
      console.error('R2 cleanup after D1 failure also failed for key:', r2Key)
    }
    return serverError(c)
  }

  if (existingApplication) {
    try {
      await c.env.STORAGE.delete(existingApplication.nidDocumentR2Key)
    } catch (error) {
      console.error('Superseded NID cleanup failed:', error)
    }
  }

  return c.json({ application: { status: 'pending' } }, existingApplication ? 200 : 201)
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
