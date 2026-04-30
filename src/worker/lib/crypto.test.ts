import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { hashPassword, verifyPassword, signJwt, verifyJwt, type JwtPayload } from './crypto'

const TEST_SECRET = 'test-secret-for-property-tests'

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

  // Feature: auth-and-social-feed, Property 3: JWT sign/verify round-trip preserves payload
  // Validates: Requirements 1.7, 2.2, 4.2
  it('Property 3: JWT sign/verify round-trip preserves payload', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sub: fc.uuid(),
          email: fc.emailAddress(),
          role: fc.constantFrom('subscriber', 'creator') as fc.Arbitrary<'subscriber' | 'creator'>,
        }),
        async ({ sub, email, role }) => {
          const iat = Math.floor(Date.now() / 1000)
          const exp = iat + 3600
          const payload: JwtPayload = { sub, email, role, iat, exp }

          const token = await signJwt(payload, TEST_SECRET)
          const result = await verifyJwt(token, TEST_SECRET)

          expect(result).not.toBeNull()
          expect(result!.sub).toBe(sub)
          expect(result!.email).toBe(email)
          expect(result!.role).toBe(role)
        }
      ),
      { numRuns: 100 }
    )
  })

  // Feature: auth-and-social-feed, Property 4: Tampered JWT is always rejected
  // Validates: Requirements 4.3
  it('Property 4: Tampered JWT is always rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sub: fc.uuid(),
          email: fc.emailAddress(),
          role: fc.constantFrom('subscriber', 'creator') as fc.Arbitrary<'subscriber' | 'creator'>,
        }),
        async ({ sub, email, role }) => {
          const iat = Math.floor(Date.now() / 1000)
          const exp = iat + 3600
          const payload: JwtPayload = { sub, email, role, iat, exp }

          const token = await signJwt(payload, TEST_SECRET)

          // A JWT is header.payload.signature — tamper only the signature part
          // to ensure the structural integrity is preserved while the HMAC is broken.
          const dotIndex = token.lastIndexOf('.')
          const sigPart = token.slice(dotIndex + 1)

          // Flip the first character of the signature to a different base64url char
          const original = sigPart[0]
          // Rotate through base64url alphabet: pick a char that is definitely different
          const replacement = original === 'A' ? 'B' : 'A'
          const tamperedSig = replacement + sigPart.slice(1)
          const tampered = token.slice(0, dotIndex + 1) + tamperedSig

          // The tampered token must be structurally different from the original
          if (tampered !== token) {
            const result = await verifyJwt(tampered, TEST_SECRET)
            expect(result).toBeNull()
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
