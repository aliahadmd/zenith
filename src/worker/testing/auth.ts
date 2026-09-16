import { expect } from 'vitest'
import { env, SELF } from 'cloudflare:test'

export function getAuthCookie(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  const cookies = headers.getSetCookie?.() ?? []
  const raw = cookies.length > 0
    ? cookies
    : response.headers.get('set-cookie')?.split(/,(?=\s*[^;,]+=[^;,]+)/) ?? []
  return raw.map((value) => value.split(';')[0]).join('; ')
}

export const TEST_PASSWORD = 'password-123456'

export function uniqueEmail(prefix = 'user') {
  return `${prefix}-${crypto.randomUUID()}@example.com`
}

// Registers through the public endpoint and marks the address verified, the
// same state a user reaches after clicking the email verification link.
export async function registerVerifiedUser(
  email = uniqueEmail(),
  password = TEST_PASSWORD,
) {
  const response = await SELF.fetch('https://example.com/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  expect(response.status).toBe(200)
  await env.DB.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').bind(email).run()
  return { email, password }
}

export async function passwordSignIn(email: string, password = TEST_PASSWORD) {
  const response = await SELF.fetch('https://example.com/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  expect(response.status).toBe(200)
  return {
    response,
    cookie: getAuthCookie(response),
    user: await response.clone().json() as { id: string; email: string; role: string; displayName: string; username: string },
  }
}

export async function signIn(email = uniqueEmail(), password = TEST_PASSWORD) {
  await registerVerifiedUser(email, password)
  return passwordSignIn(email, password)
}
