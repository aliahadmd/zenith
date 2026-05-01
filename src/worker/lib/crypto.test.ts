import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { hashPassword, verifyPassword } from './crypto'

describe('crypto property tests', () => {
  // Feature: auth-and-social-feed, Property 1: Password hash round-trip
  // Validates: Requirements 1.3, 9.2
  it('Property 1: Password hash round-trip', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 128 }),
        async (password) => {
          const hash = await hashPassword(password)
          expect(await verifyPassword(password, hash)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  // Feature: auth-and-social-feed, Property 2: Wrong password verification always fails
  // Validates: Requirements 2.4, 9.3, 10.5
  it('Property 2: Wrong password verification always fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .tuple(fc.string({ minLength: 8 }), fc.string({ minLength: 8 }))
          .filter(([a, b]) => a !== b),
        async ([p1, p2]) => {
          const hash = await hashPassword(p1)
          expect(await verifyPassword(p2, hash)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
  // Feature: auth migration, Property 3: Malformed hashes are always rejected
  it('Property 3: Malformed hashes are always rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string().filter((value) => !value.startsWith('pbkdf2:sha256:')),
        async (malformedHash) => {
          expect(await verifyPassword('password123', malformedHash)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})
