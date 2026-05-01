import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { createDb } from '../db/client'
import { users, creatorApplications } from '../db/schema'
import { authMiddleware, type HonoEnv } from '../middleware/auth'

export const creatorRoutes = new Hono<HonoEnv>()

// ── POST /apply ────────────────────────────────────────────────────────────

creatorRoutes.post('/apply', authMiddleware, async (c) => {
  const userId = c.var.user.id

  // Check if user is already a creator (fast path before parsing body)
  if (c.var.user.role === 'creator') {
    return c.json({ error: 'User is already a creator' }, 409)
  }

  // Parse multipart/form-data
  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    return c.json({ error: 'Invalid multipart/form-data body' }, 422)
  }

  // Validate required string fields in order
  const requiredStringFields = [
    'fullName',
    'address',
    'city',
    'country',
    'nidNumber',
    'socialLinks',
    'contentLinks',
  ] as const

  for (const field of requiredStringFields) {
    const value = formData.get(field)
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return c.json({ error: `Missing required field: ${field}` }, 422)
    }
  }

  // Validate nidDocument file presence
  const nidDocumentFile = formData.get('nidDocument') as File | null
  if (!nidDocumentFile || !(nidDocumentFile instanceof File)) {
    return c.json({ error: 'Missing required field: nidDocument' }, 422)
  }

  // Extract string field values
  const fullName = (formData.get('fullName') as string).trim()
  const address = (formData.get('address') as string).trim()
  const city = (formData.get('city') as string).trim()
  const country = (formData.get('country') as string).trim()
  const nidNumber = (formData.get('nidNumber') as string).trim()
  const socialLinksRaw = formData.get('socialLinks') as string
  const contentLinksRaw = formData.get('contentLinks') as string

  // Validate socialLinks: must be a JSON array of https:// URLs
  const socialLinksResult = parseHttpsUrlArray(socialLinksRaw)
  if (!socialLinksResult.ok) {
    return c.json({ error: 'Invalid URL in socialLinks' }, 422)
  }
  const socialLinks = socialLinksResult.value

  // Validate contentLinks: must be a JSON array of https:// URLs
  const contentLinksResult = parseHttpsUrlArray(contentLinksRaw)
  if (!contentLinksResult.ok) {
    return c.json({ error: 'Invalid URL in contentLinks' }, 422)
  }
  const contentLinks = contentLinksResult.value

  // Validate NID document MIME type
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedMimeTypes.includes(nidDocumentFile.type)) {
    return c.json({ error: 'NID document must be JPEG, PNG, or WebP' }, 415)
  }

  // Validate NID document size (≤ 10 MB)
  const maxSize = 10 * 1024 * 1024
  if (nidDocumentFile.size > maxSize) {
    return c.json({ error: 'NID document exceeds 10 MB limit' }, 413)
  }

  const db = createDb(c.env.DB)

  // Check for existing application (userId has UNIQUE constraint)
  const existingApplication = await db
    .select({ id: creatorApplications.id })
    .from(creatorApplications)
    .where(eq(creatorApplications.userId, userId))
    .get()

  if (existingApplication) {
    return c.json({ error: 'Application already submitted' }, 409)
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
    return c.json({ error: 'Internal server error' }, 500)
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
    return c.json({ error: 'Internal server error' }, 500)
  }

  return c.json({ role: 'creator' }, 201)
})

// ── Helpers ────────────────────────────────────────────────────────────────

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}

type ParseResult =
  | { ok: true; value: string[] }
  | { ok: false }

function parseHttpsUrlArray(raw: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false }
  }
  if (!Array.isArray(parsed)) return { ok: false }
  for (const item of parsed) {
    if (typeof item !== 'string' || !isHttpsUrl(item)) return { ok: false }
  }
  return { ok: true, value: parsed as string[] }
}
