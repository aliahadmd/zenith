import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { isValidEmail, isValidPassword, isValidUsername, isValidUrl, isValidHttpsUrl, generateUsername } from './validators'
import { profileTabsSettingsSchema } from './schemas'

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

describe('profile-and-settings-improvements property tests', () => {
  // Feature: profile-and-settings-improvements, Property 9
  // Validates: Requirements 1.1, 1.2
  it('Property 9 — isValidUsername accepts all valid usernames', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z0-9][a-z0-9_-]{1,8}[a-z0-9]$/),
        (username) => {
          expect(isValidUsername(username)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z0-9]{3}$/),
        (username) => {
          expect(isValidUsername(username)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  // Feature: profile-and-settings-improvements, Property 10
  // Validates: Requirements 1.3, 1.4
  it('Property 10 — isValidUsername rejects all invalid usernames', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 3, maxLength: 10 }).filter(s => /[A-Z]/.test(s)),
        (username) => {
          expect(isValidUsername(username)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
    fc.assert(
      fc.property(
        fc.oneof(fc.string({ maxLength: 2 }), fc.string({ minLength: 11 })),
        (username) => {
          expect(isValidUsername(username)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
    fc.assert(
      fc.property(
        fc.oneof(
          fc.stringMatching(/^[-_][a-z0-9_-]{1,8}[a-z0-9]$/),
          fc.stringMatching(/^[a-z0-9][a-z0-9_-]{1,8}[-_]$/)
        ),
        (username) => {
          expect(isValidUsername(username)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  // Feature: profile-and-settings-improvements, Property 11
  // Validates: Requirements 1.8, 1.9
  it('Property 11 — generateUsername always produces valid usernames', () => {
    fc.assert(
      fc.property(
        fc.emailAddress().map(e => e.split('@')[0]),
        (localPart) => {
          expect(isValidUsername(generateUsername(localPart))).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  // Feature: profile-and-settings-improvements, Property 12
  // Validates: Requirements 3.4
  it('Property 12 — isValidUrl accepts valid http/https URLs and rejects non-URLs', () => {
    fc.assert(
      fc.property(
        fc.webUrl({ validSchemes: ['http', 'https'] }),
        (url) => {
          expect(isValidUrl(url)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
    fc.assert(
      fc.property(
        fc.string().filter(s => { try { new URL(s); return false } catch { return true } }),
        (s) => {
          expect(isValidUrl(s)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('creator profile tab settings schema', () => {
  const validTabs = [
    { key: 'about', visible: true },
    { key: 'posts', visible: true },
    { key: 'articles', visible: true },
    { key: 'subscribers', visible: true },
    { key: 'subscribed', visible: true },
  ]

  it('accepts the full known tab list with at least one visible tab', () => {
    expect(profileTabsSettingsSchema.safeParse({ tabs: validTabs }).success).toBe(true)
  })

  it('rejects duplicate tab keys', () => {
    expect(profileTabsSettingsSchema.safeParse({
      tabs: [
        { key: 'about', visible: true },
        { key: 'about', visible: true },
        { key: 'articles', visible: true },
        { key: 'subscribers', visible: true },
        { key: 'subscribed', visible: true },
      ],
    }).success).toBe(false)
  })

  it('rejects unknown tab keys and zero visible tabs', () => {
    expect(profileTabsSettingsSchema.safeParse({
      tabs: [
        { key: 'about', visible: false },
        { key: 'posts', visible: false },
        { key: 'articles', visible: false },
        { key: 'subscribers', visible: false },
        { key: 'subscribed', visible: false },
      ],
    }).success).toBe(false)

    expect(profileTabsSettingsSchema.safeParse({
      tabs: [
        { key: 'about', visible: true },
        { key: 'posts', visible: true },
        { key: 'articles', visible: true },
        { key: 'subscribers', visible: true },
        { key: 'unknown', visible: true },
      ],
    }).success).toBe(false)
  })
})

describe('become-creator property tests', () => {
  // Feature: become-creator, Property 1: URL validation accepts only https:// URLs
  // Validates: Requirements 2.5
  describe('Property 1: URL validation accepts only https:// URLs', () => {
    it('accepts well-formed https:// URLs', () => {
      fc.assert(
        fc.property(
          fc.webUrl({ validSchemes: ['https'] }),
          (url) => {
            expect(isValidHttpsUrl(url)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('rejects http:// URLs', () => {
      fc.assert(
        fc.property(
          fc.webUrl({ validSchemes: ['http'] }),
          (url) => {
            expect(isValidHttpsUrl(url)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('rejects non-URL strings', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => { try { new URL(s); return false } catch { return true } }),
          (s) => {
            expect(isValidHttpsUrl(s)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('rejects URLs with non-https schemes', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant('ftp://example.com/file'),
            fc.constant('ws://example.com/socket'),
            fc.constant('mailto:user@example.com'),
            fc.constant('data:text/plain,hello'),
          ),
          (url) => {
            expect(isValidHttpsUrl(url)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
