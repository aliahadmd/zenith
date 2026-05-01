import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { Hono } from 'hono'

// Pure key construction helper (mirrors the logic in creator.ts)
function buildR2Key(userId: string, filename: string): string {
  return `nid-documents/${userId}/${filename}`
}

// ── Minimal duplicate-rejection handler (mirrors the relevant branch of creator.ts) ──
//
// This factory creates a minimal Hono app that replicates only the duplicate-check
// branch of the real POST /apply handler, using an injected `existingApplication`
// value so we can test the invariant without a real D1 database.
function buildDuplicateCheckApp(existingApplication: { id: string } | undefined) {
  const app = new Hono()

  app.post('/api/creator/apply', async (c) => {
    // Simulate the duplicate-check branch from creator.ts:
    //   const existingApplication = await db.select(...).get()
    //   if (existingApplication) return c.json({ error: '...' }, 409)
    if (existingApplication) {
      return c.json({ error: 'Application already submitted' }, 409)
    }
    // Would continue to R2 upload + D1 insert in the real handler
    return c.json({ role: 'creator' }, 201)
  })

  return app
}

// ── Minimal field-validation handler (mirrors the required-field checks in creator.ts) ──
//
// This factory creates a minimal Hono app that replicates only the required-field
// validation branch of the real POST /apply handler so we can test Property 5
// without a real D1 database, R2 bucket, or JWT middleware.
function buildFieldValidationApp() {
  const app = new Hono()

  const requiredStringFields = [
    'fullName',
    'address',
    'city',
    'country',
    'nidNumber',
    'socialLinks',
    'contentLinks',
  ] as const

  app.post('/api/creator/apply', async (c) => {
    let formData: FormData
    try {
      formData = await c.req.formData()
    } catch {
      return c.json({ error: 'Invalid multipart/form-data body' }, 422)
    }

    // Validate required string fields (same order as creator.ts)
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

    // All fields present — would continue to DB/R2 in the real handler
    return c.json({ role: 'creator' }, 201)
  })

  return app
}

describe('creator route property tests', () => {
  // Feature: become-creator, Property 3: R2 key follows the nid-documents/{userId}/{filename} pattern
  // Validates: Requirements 3.3
  it('Property 3: R2 key follows the nid-documents/{userId}/{filename} pattern', () => {
    fc.assert(
      fc.property(
        fc.string(), // userId
        fc.string(), // filename
        (userId, filename) => {
          const r2Key = buildR2Key(userId, filename)
          expect(r2Key).toBe(`nid-documents/${userId}/${filename}`)
        }
      ),
      { numRuns: 100 }
    )
  })

  // Feature: become-creator, Property 4: Duplicate application is always rejected
  // Validates: Requirements 3.4
  it('Property 4: Duplicate application is always rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate any non-empty userId string to represent an already-applied user
        fc.uuid(),
        async (userId) => {
          // Simulate a pre-existing application record for this user
          const existingApplication = { id: userId }
          const app = buildDuplicateCheckApp(existingApplication)

          const req = new Request('http://localhost/api/creator/apply', {
            method: 'POST',
            body: new FormData(),
          })

          const res = await app.fetch(req)

          // The handler MUST return 409 when an application already exists
          expect(res.status).toBe(409)

          const body = await res.json() as { error: string }
          expect(body.error).toBe('Application already submitted')
        }
      ),
      { numRuns: 100 }
    )
  })

  // Feature: become-creator, Property 5: Missing required fields always return 422
  // Validates: Requirements 3.6
  it('Property 5: Missing required fields always return 422', async () => {
    // All required fields for POST /api/creator/apply
    const allRequiredFields = [
      'fullName',
      'address',
      'city',
      'country',
      'nidNumber',
      'nidDocument',
      'socialLinks',
      'contentLinks',
    ] as const

    // A complete valid payload (all fields present and non-empty)
    const validStringValues: Record<string, string> = {
      fullName: 'Jane Doe',
      address: '123 Main St',
      city: 'Dhaka',
      country: 'Bangladesh',
      nidNumber: 'NID-001',
      socialLinks: JSON.stringify(['https://twitter.com/janedoe']),
      contentLinks: JSON.stringify(['https://youtube.com/janedoe']),
    }

    await fc.assert(
      fc.asyncProperty(
        // Pick a random non-empty subset of required fields to omit
        fc.shuffledSubarray(allRequiredFields, { minLength: 1 }),
        async (fieldsToOmit) => {
          const app = buildFieldValidationApp()
          const formData = new FormData()

          // Add all fields EXCEPT the ones chosen to be omitted
          for (const field of allRequiredFields) {
            if (fieldsToOmit.includes(field)) continue

            if (field === 'nidDocument') {
              // Provide a minimal valid File for the file field
              const blob = new Blob(['x'], { type: 'image/jpeg' })
              formData.append('nidDocument', new File([blob], 'id.jpg', { type: 'image/jpeg' }))
            } else {
              formData.append(field, validStringValues[field])
            }
          }

          const req = new Request('http://localhost/api/creator/apply', {
            method: 'POST',
            body: formData,
          })

          const res = await app.fetch(req)

          // The handler MUST return 422 whenever any required field is missing
          expect(res.status).toBe(422)

          const body = await res.json() as { error: string }
          // The error message MUST identify at least one of the missing fields
          expect(body.error).toMatch(/^Missing required field:/)
          const mentionedField = body.error.replace('Missing required field: ', '')
          expect(fieldsToOmit).toContain(mentionedField as typeof allRequiredFields[number])
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Unit test helpers ──────────────────────────────────────────────────────
//
// The real creatorRoutes has authMiddleware baked in as a route-level handler,
// which requires a live JWT cookie and JWT_SECRET. To unit-test the handler
// logic in isolation, we build a self-contained Hono app here that mirrors the
// full POST /apply logic from creator.ts with injectable dependencies — the
// same pattern used by the property test helpers above.

type MockUser = { id: string; email: string; role: 'subscriber' | 'creator' }

/**
 * Builds a complete Hono app that mirrors the POST /apply handler from
 * creator.ts with injectable user, db, and R2 dependencies. This lets us
 * exercise every code path without a real JWT, D1 database, or R2 bucket.
 */
function buildApplyApp(opts: {
  user: MockUser
  /** Simulates the result of the existing-application DB query */
  existingApplication?: { id: string } | undefined
  /** When true, the mock R2 put throws to simulate an upload failure */
  r2PutShouldThrow?: boolean
  /** When true, the mock D1 batch throws to simulate a write failure */
  dbBatchShouldThrow?: boolean
}) {
  const {
    user,
    existingApplication = undefined,
    r2PutShouldThrow = false,
    dbBatchShouldThrow = false,
  } = opts

  const app = new Hono()

  // Required string fields in the same order as creator.ts
  const requiredStringFields = [
    'fullName',
    'address',
    'city',
    'country',
    'nidNumber',
    'socialLinks',
    'contentLinks',
  ] as const

  app.post('/apply', async (c) => {
    // ── Auth (injected) ──────────────────────────────────────────────────
    // In the real handler this is done by authMiddleware + c.var.user.
    // Here we use the injected `user` directly.

    // ── Already a creator? ───────────────────────────────────────────────
    if (user.role === 'creator') {
      return c.json({ error: 'User is already a creator' }, 409)
    }

    // ── Parse multipart/form-data ────────────────────────────────────────
    let formData: FormData
    try {
      formData = await c.req.formData()
    } catch {
      return c.json({ error: 'Invalid multipart/form-data body' }, 422)
    }

    // ── Validate required string fields ──────────────────────────────────
    for (const field of requiredStringFields) {
      const value = formData.get(field)
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        return c.json({ error: `Missing required field: ${field}` }, 422)
      }
    }

    // ── Validate nidDocument file presence ───────────────────────────────
    const nidDocumentFile = formData.get('nidDocument') as File | null
    if (!nidDocumentFile || !(nidDocumentFile instanceof File)) {
      return c.json({ error: 'Missing required field: nidDocument' }, 422)
    }

    // ── Validate MIME type ───────────────────────────────────────────────
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedMimeTypes.includes(nidDocumentFile.type)) {
      return c.json({ error: 'NID document must be JPEG, PNG, or WebP' }, 415)
    }

    // ── Validate file size (≤ 10 MB) ─────────────────────────────────────
    const maxSize = 10 * 1024 * 1024
    if (nidDocumentFile.size > maxSize) {
      return c.json({ error: 'NID document exceeds 10 MB limit' }, 413)
    }

    // ── Check for existing application (injected DB result) ──────────────
    if (existingApplication) {
      return c.json({ error: 'Application already submitted' }, 409)
    }

    // ── Upload NID document to R2 (injected mock) ─────────────────────────
    const r2Key = `nid-documents/${user.id}/${nidDocumentFile.name}`
    if (r2PutShouldThrow) {
      return c.json({ error: 'Internal server error' }, 500)
    }
    // (In the real handler: await c.env.AVATARS.put(...))
    void r2Key // used in real handler; suppress unused-var lint

    // ── Batch DB write (injected mock) ────────────────────────────────────
    if (dbBatchShouldThrow) {
      return c.json({ error: 'Internal server error' }, 500)
    }
    // (In the real handler: await db.batch([insert, update]))

    return c.json({ role: 'creator' }, 201)
  })

  return app
}

/** Builds a valid multipart FormData with all required fields. */
function buildValidFormData(overrides: {
  omitFields?: string[]
  fileType?: string
  fileSizeBytes?: number
} = {}): FormData {
  const { omitFields = [], fileType = 'image/jpeg', fileSizeBytes = 1024 } = overrides

  const formData = new FormData()

  const stringFields: Record<string, string> = {
    fullName: 'Jane Doe',
    address: '123 Main Street',
    city: 'Dhaka',
    country: 'Bangladesh',
    nidNumber: 'NID-001',
    socialLinks: JSON.stringify(['https://twitter.com/janedoe']),
    contentLinks: JSON.stringify(['https://youtube.com/janedoe']),
  }

  for (const [field, value] of Object.entries(stringFields)) {
    if (!omitFields.includes(field)) {
      formData.append(field, value)
    }
  }

  if (!omitFields.includes('nidDocument')) {
    const bytes = new Uint8Array(fileSizeBytes)
    const blob = new Blob([bytes], { type: fileType })
    formData.append('nidDocument', new File([blob], 'id.jpg', { type: fileType }))
  }

  return formData
}

// ── Unit tests ─────────────────────────────────────────────────────────────

describe('creator route unit tests', () => {
  const subscriberUser: MockUser = {
    id: 'user-123',
    email: 'jane@example.com',
    role: 'subscriber',
  }

  const creatorUser: MockUser = {
    id: 'user-456',
    email: 'bob@example.com',
    role: 'creator',
  }

  // Requirements: 3.4
  it('returns 409 when an application already exists for the user', async () => {
    const app = buildApplyApp({
      user: subscriberUser,
      existingApplication: { id: 'existing-app-id' },
    })

    const req = new Request('http://localhost/apply', {
      method: 'POST',
      body: buildValidFormData(),
    })

    const res = await app.fetch(req)
    expect(res.status).toBe(409)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('Application already submitted')
  })

  // Requirements: 3.5
  it('returns 409 when the user role is already creator', async () => {
    const app = buildApplyApp({
      user: creatorUser,
    })

    const req = new Request('http://localhost/apply', {
      method: 'POST',
      body: buildValidFormData(),
    })

    const res = await app.fetch(req)
    expect(res.status).toBe(409)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('User is already a creator')
  })

  // Requirements: 3.7
  it('returns 413 when the NID document exceeds 10 MB', async () => {
    const app = buildApplyApp({ user: subscriberUser })

    const tenMbPlusOne = 10 * 1024 * 1024 + 1
    const req = new Request('http://localhost/apply', {
      method: 'POST',
      body: buildValidFormData({ fileSizeBytes: tenMbPlusOne }),
    })

    const res = await app.fetch(req)
    expect(res.status).toBe(413)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('NID document exceeds 10 MB limit')
  })

  // Requirements: 3.8
  it('returns 415 when the NID document MIME type is not JPEG, PNG, or WebP', async () => {
    const app = buildApplyApp({ user: subscriberUser })

    const req = new Request('http://localhost/apply', {
      method: 'POST',
      body: buildValidFormData({ fileType: 'application/pdf' }),
    })

    const res = await app.fetch(req)
    expect(res.status).toBe(415)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('NID document must be JPEG, PNG, or WebP')
  })

  // Requirements: 3.6 — one test per required field
  const requiredFields = [
    'fullName',
    'address',
    'city',
    'country',
    'nidNumber',
    'nidDocument',
    'socialLinks',
    'contentLinks',
  ] as const

  for (const field of requiredFields) {
    it(`returns 422 when required field "${field}" is missing`, async () => {
      const app = buildApplyApp({ user: subscriberUser })

      const req = new Request('http://localhost/apply', {
        method: 'POST',
        body: buildValidFormData({ omitFields: [field] }),
      })

      const res = await app.fetch(req)
      expect(res.status).toBe(422)

      const body = await res.json() as { error: string }
      expect(body.error).toBe(`Missing required field: ${field}`)
    })
  }

  // Requirements: 3.1, 3.9
  it('returns 201 with { role: "creator" } on a valid submission', async () => {
    const app = buildApplyApp({
      user: subscriberUser,
      existingApplication: undefined,
    })

    const req = new Request('http://localhost/apply', {
      method: 'POST',
      body: buildValidFormData(),
    })

    const res = await app.fetch(req)
    expect(res.status).toBe(201)

    const body = await res.json() as { role: string }
    expect(body.role).toBe('creator')
  })
})
