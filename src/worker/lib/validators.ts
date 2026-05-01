/**
 * Input validators for the auth and social feed worker.
 */

/**
 * Validates an email address using an RFC-5321-compatible regex.
 * Requires `local@domain.tld` structure:
 *   - non-empty local part (no spaces or @)
 *   - @ separator
 *   - non-empty domain (no spaces or @)
 *   - dot followed by a non-empty TLD (no spaces or @)
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Validates a password by enforcing a minimum length of 8 characters.
 * Returns true if and only if `password.length >= 8`.
 */
export function isValidPassword(password: string): boolean {
  return password.length >= 8
}

/**
 * Validates a username against the allowed format:
 *   - 3-character usernames: all lowercase alphanumeric (`/^[a-z0-9]{3}$/`)
 *   - 4-10 character usernames: starts and ends with lowercase alphanumeric,
 *     middle characters may include `_` and `-` (`/^[a-z0-9][a-z0-9_-]{1,8}[a-z0-9]$/`)
 * Uppercase letters, leading/trailing hyphens or underscores are rejected.
 */
export function isValidUsername(username: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{1,8}[a-z0-9]$|^[a-z0-9]{3}$/.test(username)
}

/**
 * Validates that a string is a well-formed absolute URL with the `https:` scheme.
 * Returns `true` if and only if the URL parses successfully and its protocol is `https:`.
 * Returns `false` for any invalid URL, non-https URL (including plain `http:`), or
 * non-URL string.
 */
export function isValidHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Validates a URL by attempting to parse it with the `URL` constructor.
 * Returns `true` only when parsing succeeds and the protocol is `http:` or `https:`.
 * Returns `false` for any unparseable string or non-http(s) protocol.
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Generates a valid username from an email local part.
 * Steps:
 *   1. Lowercase the input
 *   2. Replace characters outside `[a-z0-9]` with hyphens
 *   3. Strip leading and trailing hyphens
 *   4. If the result is empty, use `'u'` as the base
 *   5. Truncate to 5 characters
 *   6. Strip trailing hyphens from the truncated base
 *   7. Append `'-'` + a 4-character alphanumeric suffix
 */
export function generateUsername(emailLocalPart: string): string {
  let base = emailLocalPart
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/^-+|-+$/g, '')

  if (base === '') {
    base = 'u'
  }

  base = base.slice(0, 5).replace(/-+$/, '')

  const suffix = Math.random().toString(36).slice(2, 6).padEnd(4, '0')
  return `${base}-${suffix}`
}
