import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { isValidEmail, isValidPassword } from './validators'

describe('validator property tests', () => {
  // Feature: auth-and-social-feed, Property 5: Email validator rejects all malformed addresses
  // Validates: Requirements 1.5, 10.3
  describe('Property 5: Email validator rejects all malformed addresses', () => {
    it('rejects strings with no @ character', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !s.includes('@')),
          (input) => {
            expect(isValidEmail(input)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('rejects strings with @ but no domain (local@)', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 })
            .filter(s => !s.includes('@') && !s.includes(' '))
            .map(local => local + '@'),
          (input) => {
            expect(isValidEmail(input)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('rejects strings with @ but no TLD (local@domain)', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string({ minLength: 1 }),
            fc.string({ minLength: 1 })
          ).filter(([l, d]) =>
            !l.includes('@') && !l.includes(' ') &&
            !d.includes('@') && !d.includes(' ') && !d.includes('.')
          ).map(([l, d]) => l + '@' + d),
          (input) => {
            expect(isValidEmail(input)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('rejects strings with spaces', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).map(s => s + ' ' + s),
          (input) => {
            expect(isValidEmail(input)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  // Feature: auth-and-social-feed, Property 6: Password length validator enforces 8-character minimum
  // Validates: Requirements 1.6, 9.4
  describe('Property 6: Password length validator enforces 8-character minimum', () => {
    it('rejects passwords shorter than 8 characters', () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 7 }),
          (password) => {
            expect(isValidPassword(password)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('accepts passwords of 8 or more characters', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 8 }),
          (password) => {
            expect(isValidPassword(password)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
