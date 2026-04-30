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
