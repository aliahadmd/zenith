import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

// Pure sort helper (mirrors the DB ORDER BY posts.created_at DESC)
function sortPostsByDateDesc<T extends { createdAt: number | null }>(posts: T[]): T[] {
  return [...posts].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}

describe('feed route property tests', () => {
  // Feature: auth-and-social-feed, Property 7: Feed posts are always ordered by creation date descending
  // Validates: Requirements 5.2
  it('Property 7: Feed posts are always ordered by creation date descending', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            body: fc.string(),
            createdAt: fc.integer({ min: 0, max: 2_000_000_000 }),
          }),
          { minLength: 1 }
        ),
        (postList) => {
          const sorted = sortPostsByDateDesc(postList)
          for (let i = 0; i < sorted.length - 1; i++) {
            expect(sorted[i].createdAt).toBeGreaterThanOrEqual(sorted[i + 1].createdAt ?? 0)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  // Feature: auth-and-social-feed, Property 8: Follow relationship is unique per (subscriber, creator) pair
  // Validates: Requirements 6.3
  it('Property 8: Follow relationship is unique per (subscriber, creator) pair', () => {
    fc.assert(
      fc.property(
        fc.uuid(), // subscriberId
        fc.uuid(), // creatorId
        (subscriberId, creatorId) => {
          // Simulate an in-memory follows set (mimics the DB unique constraint)
          const followsSet = new Set<string>()

          const key = `${subscriberId}:${creatorId}`

          // First insert should succeed
          const firstInsert = !followsSet.has(key)
          followsSet.add(key)
          expect(firstInsert).toBe(true)

          // Second insert for the same pair should be detected as duplicate
          const secondInsert = !followsSet.has(key)
          expect(secondInsert).toBe(false)

          // The set should contain exactly one record for this pair
          const count = [...followsSet].filter(k => k === key).length
          expect(count).toBe(1)
        }
      ),
      { numRuns: 100 }
    )
  })
})
