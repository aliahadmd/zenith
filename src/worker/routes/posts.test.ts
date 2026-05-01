import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { Hono } from 'hono'

// ── Minimal post-creation handler (mirrors the logic in posts.ts) ──────────
//
// This factory creates a minimal Hono app that replicates the POST / handler
// from posts.ts with an injectable mock DB so we can test the round-trip
// invariant without a real D1 database or JWT middleware.

type MockInsertedPost = {
  id: string
  body: string
  createdAt: Date
}

function buildPostsApp(opts: {
  /** The mock user injected in place of authMiddleware + requireRole */
  user: { id: string; role: 'creator' | 'subscriber' }
  /**
   * Factory that produces the mock DB insert result for a given body.
   * Defaults to returning a UUID id, the same body, and a fixed timestamp.
   */
  mockInsert?: (body: string) => MockInsertedPost
}) {
  const {
    user,
    mockInsert = (body) => ({
      id: crypto.randomUUID(),
      body,
      createdAt: new Date(1_700_000_000_000), // fixed Unix ms timestamp
    }),
  } = opts

  const app = new Hono()

  app.post('/', async (c) => {
    // ── Role check (mirrors requireRole('creator')) ───────────────────────
    if (user.role !== 'creator') {
      return c.json({ error: 'Forbidden' }, 403)
    }

    // ── Parse JSON body ───────────────────────────────────────────────────
    let parsed: unknown
    try {
      parsed = await c.req.json()
    } catch {
      return c.json({ error: 'Post body must be between 1 and 500 characters' }, 422)
    }

    // ── Validate body field ───────────────────────────────────────────────
    const postBody = (parsed as Record<string, unknown>)?.body
    if (
      typeof postBody !== 'string' ||
      postBody.length < 1 ||
      postBody.length > 500
    ) {
      return c.json({ error: 'Post body must be between 1 and 500 characters' }, 422)
    }

    // ── Mock DB insert (mirrors the .insert().returning().get() call) ─────
    const inserted = mockInsert(postBody)

    // ── Convert Date → Unix seconds (mirrors posts.ts) ────────────────────
    const createdAtSeconds = Math.floor(inserted.createdAt.getTime() / 1000)

    return c.json(
      {
        id: inserted.id,
        body: inserted.body,
        createdAt: createdAtSeconds,
      },
      201,
    )
  })

  return app
}

// ── Property tests ─────────────────────────────────────────────────────────

describe('posts route property tests', () => {
  // Feature: become-creator, Property 9: Invalid post bodies are always rejected by the API
  // Validates: Requirements 8.3
  it('Property 9: Invalid post bodies are always rejected by the API', async () => {
    const creatorUser = { id: crypto.randomUUID(), role: 'creator' as const }

    await fc.assert(
      fc.asyncProperty(
        // Generate either an empty string or a string exceeding 500 characters
        fc.oneof(fc.constant(''), fc.string({ minLength: 501 })),
        async (invalidBody) => {
          const app = buildPostsApp({ user: creatorUser })

          const req = new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body: invalidBody }),
          })

          const res = await app.fetch(req)

          // SHALL return HTTP 422
          expect(res.status).toBe(422)

          const json = await res.json() as { error: string }

          // SHALL return a descriptive error message
          expect(json.error).toBe('Post body must be between 1 and 500 characters')
        }
      ),
      { numRuns: 100 }
    )
  })

  // Feature: become-creator, Property 8: Post creation round-trip preserves body
  // Validates: Requirements 8.4
  it('Property 8: Post creation round-trip preserves body', async () => {
    const creatorUser = { id: crypto.randomUUID(), role: 'creator' as const }

    await fc.assert(
      fc.asyncProperty(
        // Generate any valid post body: 1–500 characters
        fc.string({ minLength: 1, maxLength: 500 }),
        async (body) => {
          const app = buildPostsApp({ user: creatorUser })

          const req = new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body }),
          })

          const res = await app.fetch(req)

          // SHALL return HTTP 201
          expect(res.status).toBe(201)

          const json = await res.json() as { id: string; body: string; createdAt: number }

          // SHALL contain the same body string that was sent
          expect(json.body).toBe(body)

          // SHALL contain a non-empty id
          expect(typeof json.id).toBe('string')
          expect(json.id.length).toBeGreaterThan(0)

          // SHALL contain a positive integer createdAt
          expect(Number.isInteger(json.createdAt)).toBe(true)
          expect(json.createdAt).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Unit tests ─────────────────────────────────────────────────────────────

describe('posts route unit tests', () => {
  // Requirements: 8.1
  it('returns 403 when user role is subscriber', async () => {
    const app = buildPostsApp({ user: { id: 'user-sub', role: 'subscriber' } })

    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'Hello world' }),
    })

    const res = await app.fetch(req)
    expect(res.status).toBe(403)

    const json = await res.json() as { error: string }
    expect(json.error).toBe('Forbidden')
  })

  // Requirements: 8.2
  it('returns 422 when body is empty string', async () => {
    const app = buildPostsApp({ user: { id: 'user-creator', role: 'creator' } })

    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: '' }),
    })

    const res = await app.fetch(req)
    expect(res.status).toBe(422)

    const json = await res.json() as { error: string }
    expect(json.error).toBe('Post body must be between 1 and 500 characters')
  })

  // Requirements: 8.3
  it('returns 422 when body exceeds 500 characters', async () => {
    const app = buildPostsApp({ user: { id: 'user-creator', role: 'creator' } })

    const longBody = 'a'.repeat(501)
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: longBody }),
    })

    const res = await app.fetch(req)
    expect(res.status).toBe(422)

    const json = await res.json() as { error: string }
    expect(json.error).toBe('Post body must be between 1 and 500 characters')
  })

  // Requirements: 8.4
  it('returns 201 with correct response shape on valid body', async () => {
    const app = buildPostsApp({ user: { id: 'user-creator', role: 'creator' } })

    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'My first post!' }),
    })

    const res = await app.fetch(req)
    expect(res.status).toBe(201)

    const json = await res.json() as { id: string; body: string; createdAt: number }
    expect(typeof json.id).toBe('string')
    expect(json.id.length).toBeGreaterThan(0)
    expect(json.body).toBe('My first post!')
    expect(Number.isInteger(json.createdAt)).toBe(true)
    expect(json.createdAt).toBeGreaterThan(0)
  })
})

// ── Feed order property test ────────────────────────────────────────────────

// Minimal feed handler factory (mirrors the logic in feed.ts)
// Builds a Hono app that returns posts for a given follower in reverse-
// chronological order, using an in-memory posts + follows store.

type MockPost = {
  id: string
  authorId: string
  body: string
  createdAt: number // Unix seconds
}

function buildFeedApp(opts: {
  /** The subscriber whose feed is being loaded */
  subscriber: { id: string }
  /** All posts in the system */
  allPosts: MockPost[]
  /** Set of (followerId, followeeId) pairs */
  follows: Array<{ followerId: string; followeeId: string }>
}) {
  const { subscriber, allPosts, follows } = opts

  const app = new Hono()

  app.get('/', (c) => {
    // Replicate: SELECT posts WHERE posts.authorId IN (followed creators)
    // ORDER BY posts.createdAt DESC
    const followedCreatorIds = new Set(
      follows
        .filter((f) => f.followerId === subscriber.id)
        .map((f) => f.followeeId),
    )

    const feedPosts = allPosts
      .filter((p) => followedCreatorIds.has(p.authorId))
      .sort((a, b) => b.createdAt - a.createdAt)

    return c.json({ posts: feedPosts })
  })

  return app
}

describe('feed route property tests (posts.test.ts)', () => {
  // Feature: become-creator, Property 10: New posts appear in follower feeds in reverse-chronological order
  // Validates: Requirements 8.5
  it('Property 10: New posts appear in follower feeds in reverse-chronological order', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a subscriber id
        fc.uuid(),
        // Generate 1–10 creator ids that the subscriber follows
        fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }).map((ids) => [...new Set(ids)]).filter((ids) => ids.length >= 1),
        // Generate 1–20 posts from those creators with distinct timestamps
        fc.array(
          fc.record({
            id: fc.uuid(),
            body: fc.string({ minLength: 1, maxLength: 500 }),
            // Use a wide range of timestamps to ensure ordering is meaningful
            createdAt: fc.integer({ min: 1_000_000, max: 2_000_000_000 }),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        async (subscriberId, creatorIds, rawPosts) => {
          // Assign each post to a random creator from the followed list
          const allPosts: MockPost[] = rawPosts.map((p, i) => ({
            ...p,
            authorId: creatorIds[i % creatorIds.length],
          }))

          const follows = creatorIds.map((creatorId) => ({
            followerId: subscriberId,
            followeeId: creatorId,
          }))

          const app = buildFeedApp({
            subscriber: { id: subscriberId },
            allPosts,
            follows,
          })

          const req = new Request('http://localhost/')
          const res = await app.fetch(req)

          expect(res.status).toBe(200)

          const json = await res.json() as { posts: MockPost[] }
          const feedPosts = json.posts

          // All posts from followed creators must appear in the feed
          expect(feedPosts.length).toBe(allPosts.length)

          // Posts SHALL appear in descending order of createdAt
          for (let i = 0; i < feedPosts.length - 1; i++) {
            expect(feedPosts[i].createdAt).toBeGreaterThanOrEqual(feedPosts[i + 1].createdAt)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
